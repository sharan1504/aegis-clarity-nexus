/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase service-role query shape is generated from runtime migration state. */
import type { AuthorizedSource } from "./authorization.server";
import type { NormalizedRepository, NormalizedSecurityFinding, RecordProvenance } from "./registry";

function provenanceFor(source: AuthorizedSource, row: Record<string, unknown>): RecordProvenance {
  return { provider: source.provider, integrationId: source.integrationId, sourceSystem: "GitHub", source: "github_synced_entities", snapshotId: (row.snapshot_id as string | null | undefined) ?? source.snapshotId, syncId: (row.sync_id as string | null | undefined) ?? source.syncRunId, dataAsOf: (row.synced_at as string | null | undefined) ?? source.lastSyncAt, lastSuccessfulSyncAt: source.lastSyncAt, freshness: source.freshness.state };
}

export async function getGitHubRepositories(db: any, source: AuthorizedSource, tenantId: string): Promise<NormalizedRepository[]> {
  const { data, error } = await db.from("github_synced_entities").select("entity_key, repository_name, html_url, provider_updated_at, synced_at, snapshot_id, sync_id, stale, payload").eq("tenant_id", tenantId).eq("connection_id", source.integrationId).eq("entity_type", "repository").eq("stale", false);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, any>) => { const p = row.payload && typeof row.payload === "object" ? row.payload : {}; return { provider: "github", integrationId: source.integrationId, repositoryId: String(row.entity_key), repositoryName: row.repository_name ?? String(p.fullName ?? p.name ?? row.entity_key), url: row.html_url ?? (typeof p.htmlUrl === "string" ? p.htmlUrl : null), private: typeof p.private === "boolean" ? p.private : null, archived: typeof p.archived === "boolean" ? p.archived : null, defaultBranch: typeof p.defaultBranch === "string" ? p.defaultBranch : null, pushedAt: typeof p.pushedAt === "string" ? p.pushedAt : null, providerUpdatedAt: row.provider_updated_at ?? null, metadata: { language: p.language ?? null, visibility: p.visibility ?? null }, provenance: provenanceFor(source, row) } satisfies NormalizedRepository; });
}

export async function getGitHubSecurityFindings(db: any, source: AuthorizedSource, tenantId: string): Promise<NormalizedSecurityFinding[]> {
  const { data, error } = await db.from("github_synced_entities").select("entity_key, repository_name, alert_severity, alert_title, alert_state, html_url, provider_updated_at, synced_at, snapshot_id, sync_id, stale, payload").eq("tenant_id", tenantId).eq("connection_id", source.integrationId).eq("entity_type", "security_alert").eq("stale", false);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, any>) => { const p = row.payload && typeof row.payload === "object" ? row.payload : {}; const kind = p.kind === "code_scanning" ? "code_scanning" : "dependabot"; const raw = String(row.alert_severity ?? p.severity ?? "").toLowerCase(); const severity = ["low", "medium", "high", "critical"].includes(raw) ? raw : "unknown"; return { provider: "github", integrationId: source.integrationId, findingId: String(row.entity_key), repositoryName: row.repository_name ?? null, findingType: kind, title: row.alert_title ?? (typeof p.title === "string" ? p.title : null), severity, state: row.alert_state ?? (typeof p.state === "string" ? p.state : null), url: row.html_url ?? (typeof p.htmlUrl === "string" ? p.htmlUrl : null), providerUpdatedAt: row.provider_updated_at ?? null, metadata: { dependency: p.dependency ?? null, advisory: p.advisory ?? null }, provenance: provenanceFor(source, row) } satisfies NormalizedSecurityFinding; });
}
