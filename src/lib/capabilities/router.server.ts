// Capability Router — the single enforcement point between agents and providers.
//
//   Agent -> capability (get_license_inventory) -> Capability Router
//         -> authorized bindings only -> provider implementation -> external data
//
// Agents never name a provider, never see credentials, and can only reach
// integrations + capabilities that the tenant explicitly bound to them. This
// module is server-only.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type {
  CapabilityKey,
  CapabilityResult,
  NormalizedEntitlement,
  NormalizedQueue,
  NormalizedUser,
} from "./registry";

type UserClient = SupabaseClient<Database>;

export interface AuthorizedSource {
  integrationId: string;
  provider: string;
  displayName: string;
  status: string;
  healthStatus: string;
  lastSyncAt: string | null;
  implemented: boolean;
  isMock: boolean;
  policy: Record<string, unknown>;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Resolves the integrations an agent may use for one capability.
 * Enforced server-side against agent_integration_bindings + agent_capabilities;
 * an LLM cannot widen this set because it never supplies the tenant or provider.
 */
export async function resolveAuthorizedSources(
  supabase: UserClient,
  tenantId: string,
  agentKey: string,
  capabilityKey: CapabilityKey,
): Promise<AuthorizedSource[]> {
  const { data: cap } = await supabase
    .from("capabilities")
    .select("id")
    .eq("capability_key", capabilityKey)
    .maybeSingle();
  if (!cap) return [];

  // The agent must declare the capability at all.
  const { data: agentCap } = await supabase
    .from("agent_capabilities")
    .select("id")
    .eq("agent_key", agentKey)
    .eq("capability_id", cap.id)
    .maybeSingle();
  if (!agentCap) return [];

  const { data: bindings } = await supabase
    .from("agent_integration_bindings")
    .select("integration_id, policy, is_mock")
    .eq("tenant_id", tenantId)
    .eq("agent_key", agentKey)
    .eq("capability_id", cap.id)
    .eq("enabled", true);

  if (!bindings?.length) return [];

  const ids = bindings.map((b) => b.integration_id);
  const { data: integrations } = await supabase
    .from("integrations")
    .select("id, provider, display_name, status, health_status, last_sync_at, is_mock")
    .eq("tenant_id", tenantId)
    .in("id", ids);

  const { data: providerCaps } = await supabase
    .from("provider_capabilities")
    .select("provider, implemented")
    .eq("capability_id", cap.id);

  const implementedBy = new Map(
    (providerCaps ?? []).map((p) => [p.provider, Boolean(p.implemented)]),
  );

  return (integrations ?? []).map((i) => {
    const binding = bindings.find((b) => b.integration_id === i.id);
    return {
      integrationId: i.id,
      provider: i.provider,
      displayName: i.display_name ?? i.provider,
      status: i.status,
      healthStatus: i.health_status,
      lastSyncAt: i.last_sync_at,
      implemented: implementedBy.get(i.provider) ?? false,
      isMock: Boolean(i.is_mock) || Boolean(binding?.is_mock),
      policy: (binding?.policy ?? {}) as Record<string, unknown>,
    };
  });
}

// ---------------------------------------------------------------------------
// Provider implementations. Each provider maps its own storage/API shape into
// the normalized contract. New providers plug in here only.
// ---------------------------------------------------------------------------

interface ProviderImpl {
  license_inventory?: (s: AuthorizedSource, tenantId: string) => Promise<NormalizedEntitlement[]>;
  user_inventory?: (s: AuthorizedSource, tenantId: string) => Promise<NormalizedUser[]>;
  queue_inventory?: (s: AuthorizedSource, tenantId: string) => Promise<NormalizedQueue[]>;
}

const genesysImpl: ProviderImpl = {
  async license_inventory(source, tenantId) {
    const db = await admin();
    const [{ data: assignments }, { data: licenses }, { data: users }] = await Promise.all([
      db
        .from("genesys_user_licenses")
        .select("genesys_user_id, license_id")
        .eq("tenant_id", tenantId)
        .eq("integration_id", source.integrationId)
        .eq("is_current", true),
      db
        .from("genesys_licenses")
        .select("license_id, name")
        .eq("tenant_id", tenantId)
        .eq("integration_id", source.integrationId)
        .eq("is_current", true),
      db
        .from("genesys_users")
        .select("genesys_user_id, name, email, state, last_login_at")
        .eq("tenant_id", tenantId)
        .eq("integration_id", source.integrationId)
        .eq("is_current", true),
    ]);

    const licenseName = new Map((licenses ?? []).map((l) => [l.license_id, l.name]));
    const userById = new Map((users ?? []).map((u) => [u.genesys_user_id, u]));
    const thresholdDays = Number(source.policy["inactivity_threshold_days"] ?? 90);
    const cutoff = Date.now() - thresholdDays * 86_400_000;

    return (assignments ?? []).map((a) => {
      const user = userById.get(a.genesys_user_id);
      const lastActivityAt = user?.last_login_at ?? null;
      const inactive = !lastActivityAt || new Date(lastActivityAt).getTime() < cutoff;
      return {
        provider: "genesys",
        integrationId: source.integrationId,
        userId: a.genesys_user_id,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
        entitlementId: a.license_id,
        entitlementName: licenseName.get(a.license_id) ?? a.license_id,
        status: user?.state === "active" ? "active" : user?.state ? "inactive" : "unknown",
        usageStatus: inactive ? "inactive" : "active",
        lastActivityAt,
        metadata: { genesysState: user?.state ?? null, inactivityThresholdDays: thresholdDays },
      } satisfies NormalizedEntitlement;
    });
  },

  async user_inventory(source, tenantId) {
    const db = await admin();
    const { data } = await db
      .from("genesys_users")
      .select("genesys_user_id, name, email, state, last_login_at, title, department, division_name")
      .eq("tenant_id", tenantId)
      .eq("integration_id", source.integrationId)
      .eq("is_current", true);

    return (data ?? []).map((u) => ({
      provider: "genesys",
      integrationId: source.integrationId,
      userId: u.genesys_user_id,
      userName: u.name,
      userEmail: u.email,
      status: u.state,
      lastActivityAt: u.last_login_at,
      metadata: { title: u.title, department: u.department, division: u.division_name },
    }));
  },

  async queue_inventory(source, tenantId) {
    const db = await admin();
    const { data } = await db
      .from("genesys_queues")
      .select("queue_id, name, member_count, division_name, description")
      .eq("tenant_id", tenantId)
      .eq("integration_id", source.integrationId)
      .eq("is_current", true);

    return (data ?? []).map((q) => ({
      provider: "genesys",
      integrationId: source.integrationId,
      queueId: q.queue_id,
      queueName: q.name,
      memberCount: q.member_count,
      metadata: { division: q.division_name, description: q.description },
    }));
  },
};

/** Provider registry. Unimplemented providers resolve to no records + a warning. */
const PROVIDERS: Record<string, ProviderImpl> = {
  genesys: genesysImpl,
};

async function runCapability<T>(
  supabase: UserClient,
  tenantId: string,
  agentKey: string,
  capability: CapabilityKey,
  pick: (impl: ProviderImpl) => ((s: AuthorizedSource, t: string) => Promise<T[]>) | undefined,
): Promise<CapabilityResult<T>> {
  const sources = await resolveAuthorizedSources(supabase, tenantId, agentKey, capability);
  const result: CapabilityResult<T> = { capability, records: [], sources: [], warnings: [] };

  for (const source of sources) {
    const fn = pick(PROVIDERS[source.provider] ?? {});
    if (!source.implemented || !fn) {
      const warning = `${source.displayName} does not yet supply ${capability}.`;
      result.warnings.push(warning);
      result.sources.push({
        integrationId: source.integrationId,
        provider: source.provider,
        displayName: source.displayName,
        implemented: false,
        recordCount: 0,
        lastSyncAt: source.lastSyncAt,
        warning,
      });
      continue;
    }

    try {
      const records = await fn(source, tenantId);
      result.records.push(...records);
      result.sources.push({
        integrationId: source.integrationId,
        provider: source.provider,
        displayName: source.displayName,
        implemented: true,
        recordCount: records.length,
        lastSyncAt: source.lastSyncAt,
      });
    } catch (error) {
      console.error("[capability-router] provider read failed", {
        provider: source.provider,
        capability,
        integrationId: source.integrationId,
      });
      void error;
      const warning = `${source.displayName} could not be read for ${capability}.`;
      result.warnings.push(warning);
      result.sources.push({
        integrationId: source.integrationId,
        provider: source.provider,
        displayName: source.displayName,
        implemented: true,
        recordCount: 0,
        lastSyncAt: source.lastSyncAt,
        warning,
      });
    }
  }

  return result;
}

// Provider-neutral capability surface an agent is allowed to call.
export const capabilityRouter = {
  getLicenseInventory: (supabase: UserClient, tenantId: string, agentKey: string) =>
    runCapability<NormalizedEntitlement>(
      supabase,
      tenantId,
      agentKey,
      "license_inventory",
      (impl) => impl.license_inventory,
    ),

  getUsers: (supabase: UserClient, tenantId: string, agentKey: string) =>
    runCapability<NormalizedUser>(
      supabase,
      tenantId,
      agentKey,
      "user_inventory",
      (impl) => impl.user_inventory,
    ),

  getQueues: (supabase: UserClient, tenantId: string, agentKey: string) =>
    runCapability<NormalizedQueue>(
      supabase,
      tenantId,
      agentKey,
      "queue_inventory",
      (impl) => impl.queue_inventory,
    ),
};
