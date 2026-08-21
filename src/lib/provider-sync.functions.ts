import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";

type Provider = "github" | "slack" | "jira";
interface Credentials { accessToken?: string; baseUrl?: string; }
function decrypt(value: string): Credentials {
  const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("Credential encryption is not configured on the server.");
  const [iv, tag, ciphertext] = value.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")) as Credentials;
}
async function json(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { accept: "application/json", authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const text = await response.text();
  let body: any = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${JSON.stringify(body).slice(0, 1000)}`);
  return body;
}
async function fetchProvider(provider: Provider, credentials: Credentials) {
  const token = credentials.accessToken; if (!token) throw new Error(`${provider} has no access token.`);
  if (provider === "github") {
    const repos = await json("https://api.github.com/user/repos?per_page=100&sort=updated", token, { headers: { "x-github-api-version": "2022-11-28" } });
    const rows = (repos as any[]).map((r) => ({ entityType: "repository", entityKey: String(r.id), payload: { name: r.full_name, private: r.private, archived: r.archived, defaultBranch: r.default_branch, openIssues: r.open_issues_count, pushedAt: r.pushed_at, language: r.language, htmlUrl: r.html_url } }));
    return rows;
  }
  if (provider === "slack") {
    const auth = await json("https://slack.com/api/auth.test", token);
    if (!auth.ok) throw new Error(String(auth.error ?? "Slack authentication failed."));
    const channels = await json("https://slack.com/api/conversations.list?limit=200&exclude_archived=true", token);
    if (!channels.ok) throw new Error(String(channels.error ?? "Slack channel discovery failed."));
    return [
      { entityType: "workspace", entityKey: String(auth.team_id), payload: { team: auth.team, teamId: auth.team_id, userId: auth.user_id } },
      ...((channels.channels ?? []) as any[]).map((c) => ({ entityType: "channel", entityKey: String(c.id), payload: { name: c.name, isPrivate: c.is_private, memberCount: c.num_members, topic: c.topic?.value ?? "", purpose: c.purpose?.value ?? "" } })),
    ];
  }
  const sites = await json("https://api.atlassian.com/oauth/token/accessible-resources", token);
  const site = Array.isArray(sites) ? sites[0] as any : null;
  if (!site?.id) throw new Error("Jira returned no accessible site.");
  const base = `https://api.atlassian.com/ex/jira/${encodeURIComponent(site.id)}`;
  const projects = await json(`${base}/rest/api/3/project/search?maxResults=100`, token);
  const projectRows = (projects.values ?? []).map((p: any) => ({ entityType: "project", entityKey: String(p.id), payload: { key: p.key, name: p.name, projectType: p.projectTypeKey, url: p.self } }));
  const issues = await json(`${base}/rest/api/3/search?jql=updated%20%3E%3D%20-30d%20ORDER%20BY%20updated%20DESC&maxResults=100&fields=summary,status,issuetype,project,assignee,updated,created`, token);
  const issueRows = (issues.issues ?? []).map((i: any) => ({ entityType: "issue", entityKey: String(i.id), payload: { key: i.key, summary: i.fields?.summary, status: i.fields?.status?.name, issueType: i.fields?.issuetype?.name, project: i.fields?.project?.key, assignee: i.fields?.assignee?.displayName ?? null, updated: i.fields?.updated, created: i.fields?.created } }));
  return [...projectRows, ...issueRows];
}

export const syncReportProvider = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { provider: Provider }) => input).handler(async ({ data, context }) => {
  const { tenantId, roles } = await resolveTenant(context.supabase, context.userId);
  if (!roles.some((r) => ["admin", "manager", "analyst"].includes(r))) throw new Error("Analyst access is required to synchronize provider report data.");
  const { data: connection, error: connectionError } = await context.supabase.from("provider_connections").select("encrypted_credentials,status").eq("tenant_id", tenantId).eq("provider", data.provider).maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection || connection.status !== "connected" || !connection.encrypted_credentials) throw new Error(`${data.provider} is not connected.`);
  const started = new Date().toISOString();
  const { data: run, error: runError } = await context.supabase.from("provider_sync_runs").insert({ tenant_id: tenantId, provider: data.provider, status: "running", started_at: started }).select("id").single();
  if (runError || !run) throw runError ?? new Error("Could not create sync run.");
  try {
    const rows = await fetchProvider(data.provider, decrypt(connection.encrypted_credentials));
    const keys = rows.map((row) => row.entityKey);
    const staleQuery = context.supabase.from("provider_sync_entities").update({ stale: true, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("provider", data.provider);
    if (keys.length) await staleQuery.not("entity_key", "in", `(${keys.map((k) => `\"${k.replaceAll('"', '\\"')}\"`).join(",")})`); else await staleQuery;
    for (const row of rows) {
      await context.supabase.from("provider_sync_entities").upsert({ tenant_id: tenantId, provider: data.provider, entity_type: row.entityType, entity_key: row.entityKey, payload: row.payload, observed_at: new Date().toISOString(), sync_run_id: run.id, stale: false }, { onConflict: "tenant_id,provider,entity_type,entity_key" });
    }
    const finished = new Date().toISOString();
    const staled = await context.supabase.from("provider_sync_entities").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("provider", data.provider).eq("stale", true);
    await context.supabase.from("provider_sync_runs").update({ status: "success", finished_at: finished, records_seen: rows.length, records_upserted: rows.length, records_staled: staled.count ?? 0 }).eq("id", run.id).eq("tenant_id", tenantId);
    return { ok: true as const, provider: data.provider, records: rows.length, finishedAt: finished };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await context.supabase.from("provider_sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: message.slice(0, 2000) }).eq("id", run.id).eq("tenant_id", tenantId);
    throw new Error(message);
  }
});

export async function loadProviderReportData(supabase: any, userId: string) {
  const { tenantId } = await resolveTenant(supabase, userId);
  const { data: connections } = await supabase.from("provider_connections").select("provider,status,display_name,last_sync_at").eq("tenant_id", tenantId);
  const connected = (connections ?? []).filter((c: any) => c.status === "connected");
  const supported = connected.map((c: any) => c.provider).filter((p: string) => ["aws", "azure", "jira", "servicenow", "github", "slack"].includes(p));
  const entities = supported.length ? (await supabase.from("provider_sync_entities").select("provider,entity_type,entity_key,payload,observed_at").eq("tenant_id", tenantId).eq("stale", false).in("provider", supported)).data ?? [] : [];
  const runs = supported.length ? (await supabase.from("provider_sync_runs").select("provider,status,started_at,finished_at,records_seen,error_message").eq("tenant_id", tenantId).in("provider", supported).order("started_at", { ascending: false }).limit(100)).data ?? [] : [];
  return { connectedProviders: connected, entities, runs };
}
