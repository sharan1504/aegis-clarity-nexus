// Capability Router — the single enforcement point between agents and providers.
//
//   Agent -> capability (license_inventory) -> Capability Router
//         -> authorizeCapabilityAccess (fail closed)
//         -> provider implementation -> facts + provenance
//
// Boundaries enforced here:
//   CONNECTOR  : authentication, provider API/storage reads, parsing, normalization.
//                NO business decisions, NO thresholds, NO classifications.
//   CAPABILITY : the provider-neutral operation an agent may request.
//   POLICY     : lives in ./policy-engine.ts, applied after this layer.
//   AGENT      : reasoning, downstream of both.
//
// Agents never name a provider, never see credentials, and can only reach
// integrations + capabilities the tenant explicitly bound to them. Server-only.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { evaluateGuardrails } from "@/lib/guardrails/engine.server";
import type { GuardrailVerdict } from "@/lib/guardrails/evaluate";
import { sanitizeOutput } from "@/lib/guardrails/sanitize";
import {
  authorizeCapabilityAccess,
  DENIAL_MESSAGES,
  type AuthorizedSource,
  type AuthorizationDecision,
} from "./authorization.server";
import { evaluateFreshness, worstFreshness } from "./freshness";
import type { AgentPolicy, PolicyRevision } from "./policy";
import type {
  CapabilityKey,
  CapabilityResult,
  CapabilitySource,
  NormalizedEntitlement,
  NormalizedQueue,
  NormalizedUser,
  RecordProvenance,
} from "./registry";

type UserClient = SupabaseClient<Database>;

export type { AuthorizedSource } from "./authorization.server";

/**
 * Privileged (service-role) access. Only reachable from a provider
 * implementation, which only ever runs after authorization has succeeded.
 */
async function privilegedDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function provenanceFor(
  source: AuthorizedSource,
  sourceSystem: string,
  storeName: string,
  row: { snapshot_id?: string | null; sync_id?: string | null; synced_at?: string | null },
): RecordProvenance {
  return {
    provider: source.provider,
    integrationId: source.integrationId,
    sourceSystem,
    source: storeName,
    snapshotId: row.snapshot_id ?? source.snapshotId,
    syncId: row.sync_id ?? source.syncRunId,
    dataAsOf: row.synced_at ?? source.lastSyncAt,
    lastSuccessfulSyncAt: source.lastSyncAt,
    freshness: source.freshness.state,
  };
}

// ---------------------------------------------------------------------------
// Provider implementations. Each provider maps its own storage/API shape into
// the normalized contract and returns FACTS ONLY. New providers plug in here
// and nowhere else: agent logic, policy logic and contracts stay untouched.
// ---------------------------------------------------------------------------

interface ProviderImpl {
  /** Human-facing name of the source system, used in provenance. */
  sourceSystem: string;
  license_inventory?: (s: AuthorizedSource, tenantId: string) => Promise<NormalizedEntitlement[]>;
  user_inventory?: (s: AuthorizedSource, tenantId: string) => Promise<NormalizedUser[]>;
  queue_inventory?: (s: AuthorizedSource, tenantId: string) => Promise<NormalizedQueue[]>;
}

const genesysImpl: ProviderImpl = {
  sourceSystem: "Genesys Cloud",

  async license_inventory(source, tenantId) {
    const db = await privilegedDb();
    const [{ data: assignments }, { data: licenses }, { data: users }] = await Promise.all([
      db
        .from("genesys_user_licenses")
        .select("genesys_user_id, license_id, snapshot_id, sync_id, synced_at")
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
        .select("genesys_user_id, name, email, state, last_login_at, date_created")
        .eq("tenant_id", tenantId)
        .eq("integration_id", source.integrationId)
        .eq("is_current", true),
    ]);

    const licenseName = new Map((licenses ?? []).map((l) => [l.license_id, l.name]));
    const userById = new Map((users ?? []).map((u) => [u.genesys_user_id, u]));

    // Facts only. No thresholds, no "inactive", no optimization verdicts —
    // that interpretation happens in the policy engine.
    return (assignments ?? []).map((a) => {
      const user = userById.get(a.genesys_user_id);
      return {
        provider: "genesys",
        integrationId: source.integrationId,
        userId: a.genesys_user_id,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
        entitlementId: a.license_id,
        entitlementName: licenseName.get(a.license_id) ?? a.license_id,
        status: user?.state === "active" ? "active" : user?.state ? "inactive" : "unknown",
        lastActivityAt: user?.last_login_at ?? null,
        metadata: {
          genesysState: user?.state ?? null,
          accountCreatedAt: user?.date_created ?? null,
        },
        provenance: provenanceFor(source, "Genesys Cloud", "genesys_user_licenses", a),
      } satisfies NormalizedEntitlement;
    });
  },

  async user_inventory(source, tenantId) {
    const db = await privilegedDb();
    const { data } = await db
      .from("genesys_users")
      .select(
        "genesys_user_id, name, email, state, last_login_at, title, department, division_name, date_created, snapshot_id, sync_id, synced_at",
      )
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
      metadata: {
        title: u.title,
        department: u.department,
        division: u.division_name,
        accountCreatedAt: u.date_created,
      },
      provenance: provenanceFor(source, "Genesys Cloud", "genesys_users", u),
    }));
  },

  async queue_inventory(source, tenantId) {
    const db = await privilegedDb();
    const { data } = await db
      .from("genesys_queues")
      .select(
        "queue_id, name, member_count, division_name, description, snapshot_id, sync_id, synced_at",
      )
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
      provenance: provenanceFor(source, "Genesys Cloud", "genesys_queues", q),
    }));
  },
};

/**
 * Provider registry. Adding microsoft365/aws/jira requires only a new entry
 * here (connector + normalization) plus a provider_capabilities row — never a
 * change to agent logic, the policy engine, or the capability contracts.
 */
export const PROVIDERS: Record<string, ProviderImpl> = {
  genesys: genesysImpl,
};

export function providerImplements(provider: string, capability: CapabilityKey): boolean {
  const impl = PROVIDERS[provider];
  if (!impl) return false;
  return typeof (impl as unknown as Record<string, unknown>)[capability] === "function";
}

export interface CapabilityCallOptions {
  now?: number;
}

/** Policy in force per integration, so the agent layer can evaluate per source. */
export interface CapabilityPolicySet {
  [integrationId: string]: { policy: AgentPolicy; revision: PolicyRevision };
}

export interface RoutedCapabilityResult<T> extends CapabilityResult<T> {
  /** Populated only on denial; agents surface this instead of guessing. */
  denied?: { reason: string; message: string };
  /** Binding policies in force, keyed by integration id. */
  policies: CapabilityPolicySet;
}

function emptyResult<T>(
  capability: CapabilityKey,
  agentKey: string,
  decision: AuthorizationDecision,
  now: number,
): RoutedCapabilityResult<T> {
  return {
    capability,
    tenantId: decision.tenantId ?? "",
    agentKey,
    records: [],
    sources: [],
    warnings: decision.reason ? [DENIAL_MESSAGES[decision.reason]] : [],
    evaluatedAt: new Date(now).toISOString(),
    freshness: "unavailable",
    policies: {},
    ...(decision.reason
      ? { denied: { reason: decision.reason, message: DENIAL_MESSAGES[decision.reason] } }
      : {}),
  };
}

async function runCapability<T>(
  supabase: UserClient,
  userId: string,
  agentKey: string,
  capability: CapabilityKey,
  pick: (impl: ProviderImpl) => ((s: AuthorizedSource, t: string) => Promise<T[]>) | undefined,
  options: CapabilityCallOptions = {},
): Promise<RoutedCapabilityResult<T>> {
  const now = options.now ?? Date.now();

  // AUTHORIZATION GATE — nothing privileged happens before this succeeds.
  const decision = await authorizeCapabilityAccess(supabase, userId, agentKey, capability, { now });
  if (!decision.ok || !decision.tenantId) {
    return emptyResult<T>(capability, agentKey, decision, now);
  }

  const tenantId = decision.tenantId;
  const result: RoutedCapabilityResult<T> = {
    capability,
    tenantId,
    agentKey,
    records: [],
    sources: [],
    warnings: [],
    evaluatedAt: new Date(now).toISOString(),
    freshness: "unavailable",
    policies: {},
  };

  for (const denial of decision.denials) {
    result.warnings.push(DENIAL_MESSAGES[denial.reason]);
  }

  for (const source of decision.sources) {
    result.policies[source.integrationId] = {
      policy: source.policy,
      revision: source.policyRevision,
    };

    const freshness = evaluateFreshness(source.lastSyncAt, now);
    const baseSource: CapabilitySource = {
      integrationId: source.integrationId,
      provider: source.provider,
      displayName: source.displayName,
      implemented: true,
      recordCount: 0,
      lastSyncAt: source.lastSyncAt,
      snapshotId: source.snapshotId,
      freshness: freshness.state,
      freshnessAgeMs: freshness.ageMs,
      policyVersion: source.policyRevision.version,
    };

    const fn = pick(PROVIDERS[source.provider] ?? { sourceSystem: source.provider });
    if (!source.implemented || !fn) {
      const warning = `${source.displayName} does not yet supply ${capability}.`;
      result.warnings.push(warning);
      result.sources.push({ ...baseSource, implemented: false, warning });
      continue;
    }

    try {
      const records = await fn(source, tenantId);
      result.records.push(...records);
      result.sources.push({ ...baseSource, recordCount: records.length });
    } catch (error) {
      console.error("[capability-router] provider read failed", {
        provider: source.provider,
        capability,
        integrationId: source.integrationId,
      });
      void error;
      const warning = `${source.displayName} could not be read for ${capability}.`;
      result.warnings.push(warning);
      result.sources.push({ ...baseSource, warning });
    }
  }

  result.freshness = worstFreshness(result.sources.map((s) => s.freshness));
  return result;
}

// Provider-neutral capability surface an agent is allowed to call. The caller
// passes only the verified userId and an agentKey — never a tenant, integration
// or provider.
export const capabilityRouter = {
  getLicenseInventory: (
    supabase: UserClient,
    userId: string,
    agentKey: string,
    options?: CapabilityCallOptions,
  ) =>
    runCapability<NormalizedEntitlement>(
      supabase,
      userId,
      agentKey,
      "license_inventory",
      (impl) => impl.license_inventory,
      options,
    ),

  getUsers: (
    supabase: UserClient,
    userId: string,
    agentKey: string,
    options?: CapabilityCallOptions,
  ) =>
    runCapability<NormalizedUser>(
      supabase,
      userId,
      agentKey,
      "user_inventory",
      (impl) => impl.user_inventory,
      options,
    ),

  getQueues: (
    supabase: UserClient,
    userId: string,
    agentKey: string,
    options?: CapabilityCallOptions,
  ) =>
    runCapability<NormalizedQueue>(
      supabase,
      userId,
      agentKey,
      "queue_inventory",
      (impl) => impl.queue_inventory,
      options,
    ),
};

export const CAPABILITY_ROUTER_CALLS: Record<
  string,
  (
    supabase: UserClient,
    userId: string,
    agentKey: string,
    options?: CapabilityCallOptions,
  ) => Promise<RoutedCapabilityResult<unknown>>
> = {
  license_inventory: capabilityRouter.getLicenseInventory,
  user_inventory: capabilityRouter.getUsers,
  queue_inventory: capabilityRouter.getQueues,
};
