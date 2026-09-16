import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { UserClient } from "@/lib/execution/gateway.server";
import { runGovernedOperation, type ActorContext } from "@/lib/execution/gateway.server";
import { writeAuditServer } from "@/lib/audit.server";
import { syncGitHub } from "./github-connector.server";
import { installationTokenForCredentials } from "./github-app.server";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

type GitHubIssueAction = {
  type: "github.create_issue";
  connectionId: string;
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
};

type ExecutionState = {
  status: "proposed" | "executing" | "verified" | "failed" | "verification_unsupported";
  action?: GitHubIssueAction;
  proposedAt?: string;
  startedAt?: string;
  completedAt?: string;
  verification?: Record<string, unknown>;
  sync?: Record<string, unknown>;
  error?: string;
};

function decryptCredentials(value: string): Record<string, unknown> {
  const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("Credential encryption is not configured on the server.");
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("GitHub credential ciphertext is malformed.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")) as Record<string, unknown>;
}

async function githubRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": API_VERSION,
      "user-agent": "Aegis-AI/1.0",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${typeof body === "object" ? JSON.stringify(body).slice(0, 1200) : String(body)}`);
  return body as T;
}

async function loadGitHubConnection(tenantId: string, connectionId: string) {
  const { data, error } = await supabaseAdmin.from("provider_connections").select("id,tenant_id,provider,status,encrypted_credentials").eq("id", connectionId).eq("tenant_id", tenantId).eq("provider", "github").maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "connected" || !data.encrypted_credentials) throw new Error("The approved GitHub connection is not connected or has no server-side credentials.");
  const credentials = decryptCredentials(data.encrypted_credentials);
  return { ...data, credentials };
}

function safeRepoPart(value: string): string {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(value)) throw new Error("The approved GitHub repository target is invalid.");
  return value;
}

async function executeGitHubCreateIssue(tenantId: string, action: GitHubIssueAction) {
  const connection = await loadGitHubConnection(tenantId, action.connectionId);
  const token = await installationTokenForCredentials(connection.credentials);
  const owner = safeRepoPart(action.owner);
  const repo = safeRepoPart(action.repo);
  const created = await githubRequest<{ number: number; id: number; html_url: string; title: string; body: string | null; state: string; updated_at: string }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, token, {
    method: "POST",
    body: JSON.stringify({ title: action.title, ...(action.body ? { body: action.body } : {}), ...(action.labels?.length ? { labels: action.labels } : {}) }),
  });
  const verified = await githubRequest<{ number: number; id: number; html_url: string; title: string; body: string | null; state: string; updated_at: string }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${created.number}`, token);
  if (verified.number !== created.number || verified.title !== created.title || verified.state !== "open") {
    throw new Error("GitHub issue verification did not match the provider response.");
  }
  return { kind: "github.issue", issueNumber: verified.number, issueId: verified.id, url: verified.html_url, title: verified.title, state: verified.state, verifiedAt: new Date().toISOString(), owner, repo };
}

async function updateChangeExecution(supabase: UserClient, tenantId: string, changeRecordId: string, state: ExecutionState, stage?: string, timelineText?: string) {
  const { data: current, error: loadError } = await (supabase as any).from("change_records").select("timeline").eq("id", changeRecordId).eq("tenant_id", tenantId).single();
  if (loadError) throw loadError;
  const timeline = Array.isArray(current?.timeline) ? current.timeline : [];
  const event = timelineText ? [{ ts: new Date().toISOString(), actor: "Aegis governed execution", kind: "action", text: timelineText }, ...timeline] : timeline;
  const { error } = await (supabase as any).from("change_records").update({ execution: state, ...(stage ? { stage } : {}), timeline: event }).eq("id", changeRecordId).eq("tenant_id", tenantId);
  if (error) throw error;
}

export async function executeApprovedAction(supabase: UserClient, actor: ActorContext, changeRecordId: string) {
  const { data: change, error: changeError } = await (supabase as any).from("change_records").select("id,change_id,tenant_id,stage,agent,owner_team,execution").eq("id", changeRecordId).eq("tenant_id", actor.tenantId).single();
  if (changeError || !change) return { ok: false as const, decision: "block" as const, reasons: [changeError?.message ?? "Change record was not found."], requiredActions: ["Resolve the change record reference and retry."] };
  if (change.stage !== "Ready to Execute") return { ok: false as const, decision: "block" as const, reasons: [`Change ${change.change_id} is not ready to execute; current stage is ${change.stage}.`], requiredActions: ["Complete all required approvals first."] };
  const { data: approvals, error: approvalError } = await (supabase as any).from("change_approvals").select("status").eq("change_record_id", change.id).eq("tenant_id", actor.tenantId);
  if (approvalError) return { ok: false as const, decision: "unavailable" as const, reasons: [approvalError.message], requiredActions: ["Resolve approval state access and retry."] };
  if (!approvals?.length || approvals.some((row: { status: string }) => row.status !== "approved")) return { ok: false as const, decision: "block" as const, reasons: ["Every approval step must be approved before provider execution."], requiredActions: ["Complete the outstanding approvals."] };

  const execution = (change.execution ?? {}) as ExecutionState;
  if (execution.status === "verified") return { ok: true as const, result: execution, idempotent: true as const };
  if (execution.status === "executing") return { ok: false as const, decision: "block" as const, reasons: ["This change is already executing."], requiredActions: ["Wait for the active execution to finish."] };
  const action = execution.action;
  if (!action || action.type !== "github.create_issue") return { ok: false as const, decision: "block" as const, reasons: ["This change has no supported GitHub issue action bound to the approved record."], requiredActions: ["Create a GitHub issue change record with a bound provider action."] };
  if (String(change.owner_team).toLowerCase() !== "github operations") return { ok: false as const, decision: "block" as const, reasons: ["The approved change is not owned by GitHub Operations."], requiredActions: ["Use a GitHub-owned change record for this provider action."] };

  const startedAt = new Date().toISOString();
  const executing: ExecutionState = { ...execution, status: "executing", startedAt };
  await updateChangeExecution(supabase, actor.tenantId, change.id, executing, "Ready to Execute", `Executing approved GitHub issue action for ${change.change_id}.`);
  await writeAuditServer(supabase, { tenantId: actor.tenantId, action: "change.execution_started", entityType: "change_record", entityId: change.change_id, detail: `Governed GitHub issue execution started for ${change.change_id}.`, payload: { provider: "github", actionType: action.type, connectionId: action.connectionId, owner: action.owner, repo: action.repo } });

  const governed = await runGovernedOperation(supabase, actor, { origin: "ui", actionKey: "github.issue.create", executionClass: "write", provider: "github", capability: "issue.create", hasChangeTicket: true, hasApproval: true, hasRollbackPlan: true, changeRecordId: change.id }, async () => executeGitHubCreateIssue(actor.tenantId, action));
  if (!governed.ok) {
    const failed: ExecutionState = { ...executing, status: "failed", completedAt: new Date().toISOString(), error: governed.reasons.join(" ") };
    await updateChangeExecution(supabase, actor.tenantId, change.id, failed, "Executed", `GitHub execution was denied before provider mutation: ${failed.error}`);
    await writeAuditServer(supabase, { tenantId: actor.tenantId, action: "change.execution_failed", entityType: "change_record", entityId: change.change_id, detail: failed.error, payload: { provider: "github", decision: governed.decision, reasons: governed.reasons } });
    return governed;
  }

  try {
    const verification = governed.result;
    const sync = await syncGitHub(actor.tenantId, action.connectionId, "all", undefined, `change:${change.id}`);
    const verified: ExecutionState = { ...executing, status: "verified", completedAt: new Date().toISOString(), verification: verification as unknown as Record<string, unknown>, sync: { status: sync.status, lastSuccessfulAt: sync.lastSuccessfulAt, recordsUpserted: sync.recordsUpserted, staleCount: sync.staleCount } };
    await updateChangeExecution(supabase, actor.tenantId, change.id, verified, "Executed", `GitHub issue created and provider verification succeeded; post-change sync completed.`);
    await writeAuditServer(supabase, { tenantId: actor.tenantId, action: "change.verified", entityType: "change_record", entityId: change.change_id, detail: `GitHub mutation verified and post-change sync completed for ${change.change_id}.`, payload: { provider: "github", verification, sync: verified.sync } });
    return { ok: true as const, result: verified, idempotent: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed: ExecutionState = { ...executing, status: "failed", completedAt: new Date().toISOString(), error: message };
    await updateChangeExecution(supabase, actor.tenantId, change.id, failed, "Executed", `GitHub mutation occurred but verification or post-change sync failed: ${message}`);
    await writeAuditServer(supabase, { tenantId: actor.tenantId, action: "change.verification_failed", entityType: "change_record", entityId: change.change_id, detail: `GitHub mutation verification failed for ${change.change_id}.`, payload: { provider: "github", error: message } });
    throw error;
  }
}
