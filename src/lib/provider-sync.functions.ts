import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { resolveDepartmentContext, getDepartmentProviders } from "@/lib/department-access.server";
import { clearEvidenceCache, withEvidenceCache } from "@/lib/evidence-cache.server";

type Provider = "github" | "slack" | "jira";
interface Credentials { accessToken?: string; baseUrl?: string; }
function decrypt(value: string): Credentials { const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY; if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("Credential encryption is not configured on the server."); const [iv, tag, ciphertext] = value.split("."); const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url")); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")) as Credentials; }
async function json(url: string, token: string, init: RequestInit = {}) { const response = await fetch(url, { ...init, headers: { accept: "application/json", authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }); const text = await response.text(); let body: any = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; } if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${JSON.stringify(body).slice(0, 1000)}`); return body; }
async function fetchProvider(provider: Provider, credentials: Credentials) {
  const token = credentials.accessToken; if (!token) throw new Error(`${provider} has no access token.`);
  if (provider === "github") { const repos = await json("https://api.github.com/user/repos?per_page=100&sort=updated", token, { headers: { "x-github-api-version": "2022-11-28" } }); return (repos as any[]).map((r) => ({ entityType: "repository", entityKey: String(r.id), payload: { name: r.full_name, private: r.private, archived: r.archived, defaultBranch: r.default_branch, openIssues: r.open_issues_count, pushedAt: r.pushed_at, language: r.language, htmlUrl: r.html_url } })); }
  if (provider === "slack") { const auth = await json("https://slack.com/api/auth.test", token); if (!auth.ok) throw new Error(String(auth.error ?? "Slack authentication failed.")); const channels = await json("https://slack.com/api/conversations.list?limit=200&exclude_archived=true", token); if (!channels.ok) throw new Error(String(channels.error ?? "Slack channel discovery failed.")); return [{ entityType: "workspace", entityKey: String(auth.team_id), payload: { team: auth.team, teamId: auth.team_id, userId: auth.user_id } }, ...((channels.channels ?? []) as any[]).map((c) => ({ entityType: "channel", entityKey: String(c.id), payload: { name: c.name, isPrivate: c.is_private, memberCount: c.num_members, topic: c.topic?.value ?? "", purpose: c.purpose?.value ?? "" } }))]; }
  const sites = await json("https://api.atlassian.com/oauth/token/accessible-resources", token); const site = Array.isArray(sites) ? sites[0] as any : null; if (!site?.id) throw new Error("Jira returned no accessible site."); const base = `https://api.atlassian.com/ex/jira/${encodeURIComponent(site.id)}`; const projects = await json(`${base}/rest/api/3/project/search?maxResults=100`, token); const projectRows = (projects.values ?? []).map((p: any) => ({ entityType: "project", entityKey: String(p.id), payload: { key: p.key, name: p.name, projectType: p.projectTypeKey, url: p.self } })); const issues = await json(`${base}/rest/api/3/search?jql=updated%20%3E%3D%20-30d%20ORDER%20BY%20updated%20DESC&maxResults=100&fields=summary,status,issuetype,project,assignee,updated,created`, token); const issueRows = (issues.issues ?? []).map((i: any) => ({ entityType: "issue", entityKey: String(i.id), payload: { key: i.key, summary: i.fields?.summary, status: i.fields?.status?.name, issueType: i.fields?.issuetype?.name, project: i.fields?.project?.key, assignee: i.fields?.assignee?.displayName ?? null, updated: i.fields?.updated, created: i.fields?.created } })); return [...projectRows, ...issueRows];
}
export const syncReportProvider = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { provider: Provider; connectionId?: string }) => ({ provider: input.provider, connectionId: input.connectionId ? String(input.connectionId).trim() : null })).handler(async ({ data, context }) => {
  const { tenantId, roles } = await resolveTenant(context.supabase, context.userId); if (!roles.some((r) => ["admin", "manager", "analyst"].includes(r))) throw new Error("Analyst access is required to synchronize provider report data.");
  let connectionQuery = context.supabase.from("provider_connections").select("id,encrypted_credentials,status").eq("tenant_id", tenantId).eq("provider", data.provider).eq("status", "connected");
  if (data.connectionId) connectionQuery = connectionQuery.eq("id", data.connectionId);
  const { data: connections, error: connectionError } = await connectionQuery.order("updated_at", { ascending: false }).limit(data.connectionId ? 1 : 2);
  if (connectionError) throw connectionError;
  if (!connections?.length) throw new Error(`${data.provider} is not connected.`);
  if (!data.connectionId && connections.length > 1) throw new Error(`Multiple ${data.provider} integration instances are connected. Select a specific instance before syncing.`);
  const connection = connections[0];
  if (!connection.encrypted_credentials) throw new Error(`${data.provider} has no stored credentials.`);
  const started = new Date().toISOString(); const { data: run, error: runError } = await context.supabase.from("provider_sync_runs").insert({ tenant_id: tenantId, provider: data.provider, connection_id: connection.id, status: "running", started_at: started }).select("id").single(); if (runError || !run) throw runError ?? new Error("Could not create sync run.");
  try {
    const rows = await fetchProvider(data.provider, decrypt(connection.encrypted_credentials)); const seenByType = new Map<string, typeof rows>(); for (const row of rows) seenByType.set(row.entityType, [...(seenByType.get(row.entityType) ?? []), row]);
    for (const [entityType, candidates] of seenByType) { await context.supabase.from("provider_sync_entities").update({ stale: true, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("provider", data.provider).eq("connection_id", connection.id).eq("entity_type", entityType); for (const row of candidates) await context.supabase.from("provider_sync_entities").upsert({ tenant_id: tenantId, provider: data.provider, connection_id: connection.id, entity_type: row.entityType, entity_key: row.entityKey, payload: row.payload, observed_at: new Date().toISOString(), sync_run_id: run.id, stale: false }, { onConflict: "tenant_id,provider,connection_id,entity_type,entity_key" }); }
    const finished = new Date().toISOString(); const staled = await context.supabase.from("provider_sync_entities").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("provider", data.provider).eq("connection_id", connection.id).eq("stale", true); await context.supabase.from("provider_sync_runs").update({ status: "success", finished_at: finished, records_seen: rows.length, records_upserted: rows.length, records_staled: staled.count ?? 0 }).eq("id", run.id).eq("tenant_id", tenantId); clearEvidenceCache(); return { ok: true as const, provider: data.provider, connectionId: connection.id, records: rows.length, finishedAt: finished };
  } catch (error) { const message = error instanceof Error ? error.message : String(error); await context.supabase.from("provider_sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: message.slice(0, 2000) }).eq("id", run.id).eq("tenant_id", tenantId); throw new Error(message); }
});
export async function loadProviderReportData(supabase: any, userId: string, departmentKey?: string | null) {
  const { tenantId } = await resolveTenant(supabase, userId);
  const department = await resolveDepartmentContext(supabase, userId, departmentKey);
  const scope = `${userId}:${departmentKey ?? "default"}`;
  return withEvidenceCache(tenantId, "provider-report", scope, async () => {
    const [{ data: connections }, allowedProviders] = await Promise.all([
      supabase.from("provider_connections").select("id,provider,status,display_name,last_sync_at").eq("tenant_id", tenantId),
      getDepartmentProviders(supabase, department),
    ]);
    const connected = (connections ?? []).filter((c: any) => c.status === "connected");
    const scopedConnected = allowedProviders === null ? connected : connected.filter((c: any) => allowedProviders.includes(c.provider));

    let allowedConnectionIds: string[] | null = null;
    if (!department.unrestricted) {
      const departmentId = department.departments.find((d) => d.department_key === department.departmentKey)?.id;
      const { data: explicitAccess } = await supabase.from("department_provider_connection_access").select("connection_id").eq("tenant_id", tenantId).eq("department_id", departmentId).eq("enabled", true);
      const explicitIds = (explicitAccess ?? []).map((row: any) => row.connection_id);
      const ids: string[] = [];
      for (const provider of new Set(scopedConnected.map((c: any) => c.provider))) {
        const providerConnections = scopedConnected.filter((c: any) => c.provider === provider);
        const mapped = providerConnections.filter((c: any) => explicitIds.includes(c.id));
        if (mapped.length) ids.push(...mapped.map((c: any) => c.id));
        else if (providerConnections.length === 1) ids.push(providerConnections[0].id);
      }
      allowedConnectionIds = ids;
    }

    const providerNames = [...new Set(scopedConnected.map((c: any) => c.provider))];
    const entityQuery = supabase.from("provider_sync_entities").select("provider,connection_id,entity_type,entity_key,payload,observed_at").eq("tenant_id", tenantId).eq("stale", false);
    const runQuery = supabase.from("provider_sync_runs").select("provider,connection_id,status,started_at,finished_at,records_seen,error_message").eq("tenant_id", tenantId).order("started_at", { ascending: false }).limit(100);
    const [{ data: entityData }, { data: runData }] = providerNames.length ? await Promise.all([entityQuery.in("provider", providerNames), runQuery.in("provider", providerNames)]) : [{ data: [] }, { data: [] }];
    const entities = entityData ?? [];
    const runs = runData ?? [];
    const filteredEntities = allowedConnectionIds === null ? entities : entities.filter((entity: any) => entity.connection_id && allowedConnectionIds!.includes(entity.connection_id));
    const filteredRuns = allowedConnectionIds === null ? runs : runs.filter((run: any) => run.connection_id && allowedConnectionIds!.includes(run.connection_id));
    return { connectedProviders: allowedConnectionIds === null ? scopedConnected : scopedConnected.filter((c: any) => allowedConnectionIds!.includes(c.id)), entities: filteredEntities, runs: filteredRuns, department: { key: department.departmentKey, name: department.departmentName, unrestricted: department.unrestricted } };
  });
}

export interface CorrelatedSignal { title: string; detail: string; providers: string[]; timestamp: string; evidence: Array<{ provider: string; entityType: string; entityKey: string; observedAt: string }>; }
export function deriveCorrelatedSignals(entities: any[]): CorrelatedSignal[] {
  const github = entities.filter((e) => e.provider === "github" && e.entity_type === "repository" && e.payload?.pushedAt);
  const jira = entities.filter((e) => e.provider === "jira" && e.entity_type === "issue" && (e.payload?.updated || e.payload?.created));
  const signals: CorrelatedSignal[] = [];
  for (const repo of github) for (const issue of jira) {
    const repoAt = new Date(repo.payload.pushedAt).getTime(); const issueAt = new Date(issue.payload.updated ?? issue.payload.created).getTime();
    if (!Number.isFinite(repoAt) || !Number.isFinite(issueAt) || Math.abs(repoAt - issueAt) > 24 * 60 * 60 * 1000) continue;
    signals.push({ title: `GitHub activity aligns temporally with Jira issue ${issue.payload.key}`, detail: `${repo.payload.name} was pushed near the time Jira issue ${issue.payload.key} (${issue.payload.summary ?? "no summary"}) was updated. This is a temporal correlation only; Aegis does not infer causation.`, providers: ["GitHub", "Jira"], timestamp: new Date(Math.max(repoAt, issueAt)).toISOString(), evidence: [{ provider: "GitHub", entityType: repo.entity_type, entityKey: repo.entity_key, observedAt: repo.observed_at }, { provider: "Jira", entityType: issue.entity_type, entityKey: issue.entity_key, observedAt: issue.observed_at }] });
    if (signals.length >= 10) return signals;
  }
  return signals;
}