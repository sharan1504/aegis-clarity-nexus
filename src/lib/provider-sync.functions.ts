import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { resolveDepartmentContext, getDepartmentProviders } from "@/lib/department-access.server";
import { clearEvidenceCache, withEvidenceCache } from "@/lib/evidence-cache.server";
import { recordOperationalIssueSafely } from "@/lib/operational-issues.server";
import { fetchPlatformEntities, decryptProviderCredentials, type ConnectorEntity, type ConnectorProvider } from "@/lib/integrations/platform-connectors.server";
import { syncGitHub } from "@/lib/integrations/github-connector.server";

type Provider = ConnectorProvider | "github";

export const syncReportProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { provider: Provider; connectionId?: string }) => ({ provider: input.provider, connectionId: input.connectionId ? String(input.connectionId).trim() : null }))
  .handler(async ({ data, context }) => {
    const { tenantId, roles } = await resolveTenant(context.supabase, context.userId);
    if (!roles.some((r) => ["admin", "manager", "analyst"].includes(r))) throw new Error("Analyst access is required to synchronize provider report data.");

    let connectionQuery = context.supabase.from("provider_connections").select("id,encrypted_credentials,status").eq("tenant_id", tenantId).eq("provider", data.provider).eq("status", "connected");
    if (data.connectionId) connectionQuery = connectionQuery.eq("id", data.connectionId);
    const { data: connections, error: connectionError } = await connectionQuery.order("updated_at", { ascending: false }).limit(data.connectionId ? 1 : 2);
    if (connectionError) throw connectionError;
    if (!connections?.length) throw new Error(`${data.provider} is not connected.`);
    if (!data.connectionId && connections.length > 1) throw new Error(`Multiple ${data.provider} integration instances are connected. Select a specific instance before syncing.`);

    const connection = connections[0];
    if (!connection.encrypted_credentials) throw new Error(`${data.provider} has no stored credentials.`);

    if (data.provider === "github") {
      const result = await syncGitHub(tenantId, connection.id, "all");
      clearEvidenceCache();
      return { ok: true as const, provider: data.provider, connectionId: connection.id, records: result.recordsUpserted, finishedAt: result.lastSuccessfulAt };
    }

    const started = new Date().toISOString();
    const { data: run, error: runError } = await context.supabase.from("provider_sync_runs").insert({ tenant_id: tenantId, provider: data.provider, connection_id: connection.id, status: "running", started_at: started }).select("id").single();
    if (runError || !run) throw runError ?? new Error("Could not create sync run.");

    try {
      const rows: ConnectorEntity[] = await fetchPlatformEntities(data.provider, decryptProviderCredentials(connection.encrypted_credentials));
      const seenByType = new Map<string, ConnectorEntity[]>();
      for (const item of rows) seenByType.set(item.entityType, [...(seenByType.get(item.entityType) ?? []), item]);

      for (const [entityType, candidates] of seenByType) {
        const staleAt = new Date().toISOString();
        const { error: staleError } = await context.supabase.from("provider_sync_entities").update({ stale: true, updated_at: staleAt }).eq("tenant_id", tenantId).eq("provider", data.provider).eq("connection_id", connection.id).eq("entity_type", entityType);
        if (staleError) throw staleError;
        for (const item of candidates) {
          const { error: upsertError } = await context.supabase.from("provider_sync_entities").upsert({ tenant_id: tenantId, provider: data.provider, connection_id: connection.id, entity_type: item.entityType, entity_key: item.entityKey, payload: item.payload, observed_at: new Date().toISOString(), sync_run_id: run.id, stale: false }, { onConflict: "tenant_id,provider,connection_id,entity_type,entity_key" });
          if (upsertError) throw upsertError;
        }
      }

      const finished = new Date().toISOString();
      const staled = await context.supabase.from("provider_sync_entities").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("provider", data.provider).eq("connection_id", connection.id).eq("stale", true);
      const { error: runUpdateError } = await context.supabase.from("provider_sync_runs").update({ status: "success", finished_at: finished, records_seen: rows.length, records_upserted: rows.length, records_staled: staled.count ?? 0 }).eq("id", run.id).eq("tenant_id", tenantId);
      if (runUpdateError) throw runUpdateError;

      clearEvidenceCache();
      return { ok: true as const, provider: data.provider, connectionId: connection.id, records: rows.length, finishedAt: finished };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await context.supabase.from("provider_sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: message.slice(0, 2000) }).eq("id", run.id).eq("tenant_id", tenantId);
      await recordOperationalIssueSafely(context.supabase, { tenantId, source: "sync", severity: "high", title: `${data.provider} provider sync failed`, detail: `Provider synchronization failed for connection ${connection.id}. ${message}`, relatedId: run.id });
      throw new Error(message);
    }
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
    const [{ data: entityData }, { data: runData }] = providerNames.length
      ? await Promise.all([entityQuery.in("provider", providerNames), runQuery.in("provider", providerNames)])
      : [{ data: [] }, { data: [] }];
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
    const repoAt = new Date(repo.payload.pushedAt).getTime();
    const issueAt = new Date(issue.payload.updated ?? issue.payload.created).getTime();
    if (!Number.isFinite(repoAt) || !Number.isFinite(issueAt) || Math.abs(repoAt - issueAt) > 24 * 60 * 60 * 1000) continue;
    signals.push({ title: `GitHub activity aligns temporally with Jira issue ${issue.payload.key}`, detail: `${repo.payload.name} was pushed near the time Jira issue ${issue.payload.key} (${issue.payload.summary ?? "no summary"}) was updated. This is a temporal correlation only; Aegis does not infer causation.`, providers: ["GitHub", "Jira"], timestamp: new Date(Math.max(repoAt, issueAt)).toISOString(), evidence: [{ provider: "GitHub", entityType: repo.entity_type, entityKey: repo.entity_key, observedAt: repo.observed_at }, { provider: "Jira", entityType: issue.entity_type, entityKey: issue.entity_key, observedAt: issue.observed_at }] });
    if (signals.length >= 10) return signals;
  }
  return signals;
}
