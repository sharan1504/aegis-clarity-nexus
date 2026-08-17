// Capability authorization — the security boundary between agents and data.
//
//   User -> Tenant -> Agent -> Capability -> Binding -> Integration -> Provider
//
// EVERY step is resolved server-side from authorized records. Callers (including
// any future LLM or tool call) may only supply an agentKey and a capabilityKey;
// tenant id, integration ids, provider names and snapshot ids are derived here.
// The privileged (service-role) client must never be touched before
// `authorizeCapabilityAccess` returns ok.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { evaluateFreshness, type FreshnessInfo } from "./freshness";
import { coerceStoredPolicy, type AgentPolicy, type PolicyRevision } from "./policy";
import type { CapabilityKey } from "./registry";

type UserClient = SupabaseClient<Database>;

export type DenialReason =
  | "no_tenant"
  | "no_role"
  | "agent_not_found"
  | "capability_unknown"
  | "capability_not_assigned_to_agent"
  | "integration_not_bound"
  | "binding_disabled"
  | "integration_not_found"
  | "tenant_mismatch"
  | "capability_not_supported_by_provider"
  | "integration_unhealthy";

export const DENIAL_MESSAGES: Record<DenialReason, string> = {
  no_tenant: "Your account is not attached to a workspace yet.",
  no_role: "Your account has no role in this workspace.",
  agent_not_found: "That agent does not exist.",
  capability_unknown: "That capability is not part of the capability registry.",
  capability_not_assigned_to_agent: "This agent does not support that capability.",
  integration_not_bound: "No data source is enabled for this agent and capability.",
  binding_disabled: "The data source is disabled for this agent.",
  integration_not_found: "That integration is not connected in this workspace.",
  tenant_mismatch: "That integration belongs to another workspace.",
  capability_not_supported_by_provider:
    "This provider does not currently support this capability.",
  integration_unhealthy: "The connection requires attention before it can be read.",
};

/** One integration an agent is authorized to read for one capability. */
export interface AuthorizedSource {
  integrationId: string;
  provider: string;
  displayName: string;
  status: string;
  healthStatus: string;
  lastSyncAt: string | null;
  snapshotId: string | null;
  syncRunId: string | null;
  implemented: boolean;
  isMock: boolean;
  freshness: FreshnessInfo;
  bindingId: string;
  policy: AgentPolicy;
  policyRevision: PolicyRevision;
}

export interface AuthorizationDecision {
  ok: boolean;
  /** Always resolved from the verified session, never from caller input. */
  tenantId: string | null;
  agentKey: string;
  capabilityKey: CapabilityKey;
  capabilityId: string | null;
  roles: string[];
  sources: AuthorizedSource[];
  /** Per-integration denials that did not fail the whole call. */
  denials: Array<{ integrationId: string; provider: string; reason: DenialReason }>;
  /** Set when the whole call is denied. */
  reason?: DenialReason;
}

function deny(
  agentKey: string,
  capabilityKey: CapabilityKey,
  reason: DenialReason,
  tenantId: string | null = null,
  roles: string[] = [],
): AuthorizationDecision {
  return {
    ok: false,
    tenantId,
    agentKey,
    capabilityKey,
    capabilityId: null,
    roles,
    sources: [],
    denials: [],
    reason,
  };
}

/**
 * Fails closed. Resolves the caller's tenant + roles, verifies the agent, the
 * capability, the agent↔capability assignment, then every binding, every
 * integration's tenant ownership, provider support and health.
 */
export async function authorizeCapabilityAccess(
  supabase: UserClient,
  userId: string,
  agentKey: string,
  capabilityKey: CapabilityKey,
  options: { now?: number; allowUnhealthy?: boolean } = {},
): Promise<AuthorizationDecision> {
  const now = options.now ?? Date.now();

  // 1. User -> Tenant. Derived from the session's profile row under RLS.
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const tenantId = profile?.tenant_id ?? null;
  if (!tenantId) return deny(agentKey, capabilityKey, "no_tenant");

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  const roles = (roleRows ?? []).map((r) => String(r.role));
  if (!roles.length) return deny(agentKey, capabilityKey, "no_role", tenantId);

  // 2. Agent must exist in the registry.
  const { data: agent } = await supabase
    .from("agent_definitions")
    .select("agent_key")
    .eq("agent_key", agentKey)
    .maybeSingle();
  if (!agent) return deny(agentKey, capabilityKey, "agent_not_found", tenantId, roles);

  // 3. Capability must exist in the registry.
  const { data: capability } = await supabase
    .from("capabilities")
    .select("id, capability_key")
    .eq("capability_key", capabilityKey)
    .maybeSingle();
  if (!capability) return deny(agentKey, capabilityKey, "capability_unknown", tenantId, roles);

  // 4. Capability must be assigned to this agent.
  const { data: agentCap } = await supabase
    .from("agent_capabilities")
    .select("id")
    .eq("agent_key", agentKey)
    .eq("capability_id", capability.id)
    .maybeSingle();
  if (!agentCap)
    return deny(agentKey, capabilityKey, "capability_not_assigned_to_agent", tenantId, roles);

  // 5. Bindings: tenant-scoped, agent-scoped, capability-scoped, enabled only.
  const { data: bindings } = await supabase
    .from("agent_integration_bindings")
    .select("id, integration_id, policy, policy_version, updated_at, updated_by, enabled, is_mock, tenant_id")
    .eq("tenant_id", tenantId)
    .eq("agent_key", agentKey)
    .eq("capability_id", capability.id);

  const base = {
    ok: true,
    tenantId,
    agentKey,
    capabilityKey,
    capabilityId: capability.id,
    roles,
  } as const;

  const enabled = (bindings ?? []).filter((b) => b.enabled && b.tenant_id === tenantId);
  const disabled = (bindings ?? []).filter((b) => !b.enabled);

  if (!enabled.length) {
    return {
      ...base,
      ok: false,
      sources: [],
      denials: disabled.map((b) => ({
        integrationId: b.integration_id,
        provider: "unknown",
        reason: "binding_disabled" as DenialReason,
      })),
      reason: disabled.length ? "binding_disabled" : "integration_not_bound",
    };
  }

  // 6. Integrations must belong to the SAME tenant. The filter is the boundary;
  // an id from another tenant simply resolves to nothing.
  const { data: integrations } = await supabase
    .from("integrations")
    .select(
      "id, tenant_id, provider, display_name, status, health_status, last_sync_at, is_mock, active_snapshot_id, active_sync_run_id",
    )
    .eq("tenant_id", tenantId)
    .in(
      "id",
      enabled.map((b) => b.integration_id),
    );

  // 7. Provider must implement the capability.
  const { data: providerCaps } = await supabase
    .from("provider_capabilities")
    .select("provider, implemented")
    .eq("capability_id", capability.id);
  const providerSupport = new Map(
    (providerCaps ?? []).map((p) => [p.provider, Boolean(p.implemented)]),
  );

  const sources: AuthorizedSource[] = [];
  const denials: AuthorizationDecision["denials"] = [];

  for (const binding of enabled) {
    const integration = (integrations ?? []).find((i) => i.id === binding.integration_id);
    if (!integration) {
      denials.push({
        integrationId: binding.integration_id,
        provider: "unknown",
        reason: "integration_not_found",
      });
      continue;
    }
    if (integration.tenant_id !== tenantId) {
      denials.push({
        integrationId: integration.id,
        provider: integration.provider,
        reason: "tenant_mismatch",
      });
      continue;
    }
    if (!providerSupport.has(integration.provider)) {
      denials.push({
        integrationId: integration.id,
        provider: integration.provider,
        reason: "capability_not_supported_by_provider",
      });
      continue;
    }
    const unhealthy =
      integration.status !== "connected" ||
      (integration.health_status !== "healthy" && integration.health_status !== "unknown");
    if (unhealthy && !options.allowUnhealthy) {
      denials.push({
        integrationId: integration.id,
        provider: integration.provider,
        reason: "integration_unhealthy",
      });
      continue;
    }

    sources.push({
      integrationId: integration.id,
      provider: integration.provider,
      displayName: integration.display_name ?? integration.provider,
      status: integration.status,
      healthStatus: integration.health_status,
      lastSyncAt: integration.last_sync_at,
      snapshotId: integration.active_snapshot_id ?? null,
      syncRunId: integration.active_sync_run_id ?? null,
      implemented: providerSupport.get(integration.provider) ?? false,
      isMock: Boolean(integration.is_mock) || Boolean(binding.is_mock),
      freshness: evaluateFreshness(integration.last_sync_at, now),
      bindingId: binding.id,
      policy: coerceStoredPolicy(binding.policy),
      policyRevision: {
        version: Number(binding.policy_version ?? 1),
        updatedAt: binding.updated_at ?? null,
        updatedBy: binding.updated_by ?? null,
      },
    });
  }

  if (!sources.length) {
    return {
      ...base,
      ok: false,
      sources: [],
      denials,
      reason: denials[0]?.reason ?? "integration_not_bound",
    };
  }

  return { ...base, sources, denials };
}
