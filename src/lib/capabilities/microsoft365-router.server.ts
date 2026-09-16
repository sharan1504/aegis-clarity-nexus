import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { evaluateGuardrails } from "@/lib/guardrails/engine.server";
import { sanitizeOutput } from "@/lib/guardrails/sanitize";
import { decryptCredentials } from "@/lib/integrations/credential-vault.server";
import { Microsoft365LicenseConnector, type Microsoft365Connection } from "@/lib/microsoft365/connector.server";
import { authorizeCapabilityAccess, DENIAL_MESSAGES, type AuthorizedSource } from "./authorization.server";
import { evaluateFreshness, worstFreshness } from "./freshness";
import type { AgentPolicy, PolicyRevision } from "./policy";
import type { CapabilitySource, NormalizedEntitlement, NormalizedUser } from "./registry";

type UserClient = SupabaseClient<Database>;
export interface Microsoft365RoutedResult<T> { tenantId: string; agentKey: string; records: T[]; sources: CapabilitySource[]; warnings: string[]; evaluatedAt: string; freshness: ReturnType<typeof worstFreshness>; denied?: { reason: string; message: string }; policies: Record<string, { policy: AgentPolicy; revision: PolicyRevision }>; }

async function run<T>(supabase: UserClient, userId: string, agentKey: string, capability: "license_inventory" | "user_inventory", map: (source: AuthorizedSource, result: Awaited<ReturnType<Microsoft365LicenseConnector["sync"]>>) => T[], now = Date.now()): Promise<Microsoft365RoutedResult<T>> {
  const decision = await authorizeCapabilityAccess(supabase, userId, agentKey, capability, { now });
  if (!decision.ok || !decision.tenantId) return { tenantId: decision.tenantId ?? "", agentKey, records: [], sources: [], warnings: decision.reason ? [DENIAL_MESSAGES[decision.reason]] : [], evaluatedAt: new Date(now).toISOString(), freshness: "unavailable", denied: decision.reason ? { reason: decision.reason, message: DENIAL_MESSAGES[decision.reason] } : undefined, policies: {} };
  const result: Microsoft365RoutedResult<T> = { tenantId: decision.tenantId, agentKey, records: [], sources: [], warnings: decision.denials.map((d) => DENIAL_MESSAGES[d.reason]), evaluatedAt: new Date(now).toISOString(), freshness: "unavailable", policies: {} };
  const admin = await import("@/integrations/supabase/client.server").then((module) => module.supabaseAdmin);
  for (const source of decision.sources.filter((candidate) => ["m365", "microsoft365"].includes(candidate.provider))) {
    result.policies[source.integrationId] = { policy: source.policy, revision: source.policyRevision };
    const freshness = evaluateFreshness(source.lastSyncAt, now);
    const base: CapabilitySource = { integrationId: source.integrationId, provider: source.provider, displayName: source.displayName, implemented: true, recordCount: 0, lastSyncAt: source.lastSyncAt, snapshotId: source.snapshotId, freshness: freshness.state, freshnessAgeMs: freshness.ageMs, policyVersion: source.policyRevision.version };
    const guardrail = await evaluateGuardrails(supabase, { tenantId: decision.tenantId, actorRole: decision.roles[0] ?? null, origin: "capability_router", agentKey, provider: source.provider, integrationId: source.integrationId, capability, actionKey: `capability.${capability}`, environment: source.isMock ? "development" : "production", executionClass: "read_only", freshness: freshness.state, dataClassification: "confidential" }, { userId });
    if (!guardrail.allowed) { const warning = guardrail.reasons[0] ?? "A guardrail prevented Microsoft 365 data from being read."; result.warnings.push(warning); result.sources.push({ ...base, warning }); continue; }
    try {
      const { data: connection, error } = await admin.from("provider_connections").select("encrypted_credentials").eq("tenant_id", decision.tenantId).eq("integration_id", source.integrationId).maybeSingle();
      if (error) throw error;
      if (!connection?.encrypted_credentials) throw new Error("Microsoft 365 credentials are not available for this integration source.");
      const credentials = decryptCredentials<Microsoft365Connection>(connection.encrypted_credentials);
      const snapshot = await new Microsoft365LicenseConnector(credentials).sync();
      const records = map(source, snapshot);
      const capped = guardrail.maxRecords == null ? records : records.slice(0, guardrail.maxRecords);
      result.records.push(...sanitizeOutput(capped, guardrail.redactFields));
      result.sources.push({ ...base, recordCount: capped.length });
    } catch (error) {
      const warning = `${source.displayName} could not be read for ${capability}: ${error instanceof Error ? error.message : "provider read failed"}`;
      result.warnings.push(warning); result.sources.push({ ...base, warning });
    }
  }
  result.freshness = worstFreshness(result.sources.map((s) => s.freshness));
  return result;
}

export const microsoft365CapabilityRouter = {
  getLicenseInventory: (supabase: UserClient, userId: string, agentKey: string, options?: { now?: number }) => run<NormalizedEntitlement>(supabase, userId, agentKey, "license_inventory", (source, snapshot) => { const users = new Map(snapshot.users.map((u) => [u.externalId, u])); const licenses = new Map(snapshot.licenses.map((l) => [l.externalId, l])); return snapshot.assignments.map((assignment) => { const user = users.get(assignment.userExternalId); const license = licenses.get(assignment.licenseExternalId); return { provider: "microsoft365", integrationId: source.integrationId, userId: assignment.userExternalId, userName: user?.name ?? null, userEmail: user?.email ?? null, entitlementId: assignment.licenseExternalId, entitlementName: license?.name ?? assignment.licenseExternalId, status: "active", lastActivityAt: assignment.lastActivityAt ?? null, metadata: { ...(assignment.metadata ?? {}), licenseStatus: license?.status ?? null }, provenance: { provider: "microsoft365", integrationId: source.integrationId, sourceSystem: "Microsoft Graph", source: "microsoft_graph.assignments", snapshotId: null, syncId: null, dataAsOf: snapshot.snapshot.syncedAt, lastSuccessfulSyncAt: snapshot.snapshot.lastSuccessfulSyncAt, freshness: snapshot.snapshot.freshness } } satisfies NormalizedEntitlement; }); }, options?.now),
  getUsers: (supabase: UserClient, userId: string, agentKey: string, options?: { now?: number }) => run<NormalizedUser>(supabase, userId, agentKey, "user_inventory", (source, snapshot) => snapshot.users.map((user) => ({ provider: "microsoft365", integrationId: source.integrationId, userId: user.externalId, userName: user.name, userEmail: user.email, status: user.status, lastActivityAt: null, metadata: user.metadata ?? {}, provenance: { provider: "microsoft365", integrationId: source.integrationId, sourceSystem: "Microsoft Graph", source: "microsoft_graph.users", snapshotId: null, syncId: null, dataAsOf: snapshot.snapshot.syncedAt, lastSuccessfulSyncAt: snapshot.snapshot.lastSuccessfulSyncAt, freshness: snapshot.snapshot.freshness } })), options?.now),
};
