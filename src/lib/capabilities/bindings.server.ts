// Server-only orchestration for the Agent <-> Connector architecture.
// Every read/write here is scoped to the tenant derived from the verified
// session; the browser never supplies a tenant_id.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { CapabilityDef, DataSourceState } from "./registry";

type UserClient = SupabaseClient<Database>;

export class BindingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "BindingError";
  }
}

export const BINDING_ERRORS: Record<string, string> = {
  no_tenant: "Your account is not attached to a workspace yet.",
  forbidden: "Only workspace admins and managers can change agent data sources.",
  unknown_agent: "That agent does not exist.",
  unknown_capability: "That capability is not part of the capability registry.",
  capability_not_supported_by_agent: "This agent does not support that capability.",
  capability_not_supported_by_provider:
    "This provider does not currently support this capability.",
  integration_not_found: "That integration is not connected in this workspace.",
  save_failed: "The data source could not be saved. Please try again.",
};

export function bindingErrorPayload(error: unknown) {
  const code = error instanceof BindingError ? error.code : "save_failed";
  return { ok: false as const, errorCode: code, errorMessage: BINDING_ERRORS[code] ?? BINDING_ERRORS['save_failed'] };
}

export interface TenantContext {
  tenantId: string;
  roles: string[];
  canManage: boolean;
}

export async function resolveTenant(supabase: UserClient, userId: string): Promise<TenantContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  const tenantId = profile?.tenant_id;
  if (!tenantId) throw new BindingError("no_tenant", BINDING_ERRORS['no_tenant']!);

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);

  const roles = (roleRows ?? []).map((r) => String(r.role));
  return { tenantId, roles, canManage: roles.includes("admin") || roles.includes("manager") };
}

export async function requireManage(supabase: UserClient, userId: string) {
  const ctx = await resolveTenant(supabase, userId);
  if (!ctx.canManage) throw new BindingError("forbidden", BINDING_ERRORS['forbidden']!);
  return ctx;
}

function mapCapability(row: {
  id: string;
  capability_key: string;
  display_name: string;
  description: string | null;
  category: string;
  read_only: boolean;
  write_capable: boolean;
}): CapabilityDef {
  return {
    id: row.id,
    key: row.capability_key,
    displayName: row.display_name,
    description: row.description,
    category: row.category,
    readOnly: row.read_only,
    writeCapable: row.write_capable,
  };
}

const CAPABILITY_COLUMNS =
  "id, capability_key, display_name, description, category, read_only, write_capable";

/** Capabilities the given agent is allowed to use at all. */
export async function getAgentCapabilities(
  supabase: UserClient,
  agentKey: string,
): Promise<Array<CapabilityDef & { required: boolean }>> {
  const { data } = await supabase
    .from("agent_capabilities")
    .select(`required, capabilities!inner(${CAPABILITY_COLUMNS})`)
    .eq("agent_key", agentKey);

  return (data ?? []).map((row) => {
    const cap = row.capabilities as never as Parameters<typeof mapCapability>[0];
    return { ...mapCapability(cap), required: Boolean(row.required) };
  });
}

export interface DataSourceView {
  bindings: Array<{
    id: string;
    integrationId: string;
    capabilityId: string;
    capabilityKey: string;
    capabilityName: string;
    enabled: boolean;
    policy: Record<string, unknown>;
    isMock: boolean;
  }>;
  integrations: Array<{
    integrationId: string;
    provider: string;
    displayName: string;
    orgName: string | null;
    status: string;
    healthStatus: string;
    lastSyncAt: string | null;
    isMock: boolean;
    state: DataSourceState;
    /** Capabilities this provider can offer that the agent also supports. */
    compatibleCapabilities: Array<CapabilityDef & { implemented: boolean; bound: boolean }>;
    /** Why the integration cannot be used at all, when applicable. */
    incompatibleReason?: string;
  }>;
  agentCapabilities: Array<CapabilityDef & { required: boolean }>;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Full Data Sources view for one agent: bound sources, connected-but-unbound
 * sources, and connected-but-incompatible sources with an explicit reason.
 */
export async function getAgentDataSources(
  supabase: UserClient,
  tenantId: string,
  agentKey: string,
): Promise<DataSourceView> {
  const agentCapabilities = await getAgentCapabilities(supabase, agentKey);
  const agentCapIds = new Set(agentCapabilities.map((c) => c.id));

  const [{ data: integrations }, { data: bindingRows }, { data: providerCaps }] = await Promise.all([
    supabase
      .from("integrations")
      .select(
        "id, provider, display_name, external_org_name, status, health_status, last_sync_at, is_mock",
      )
      .eq("tenant_id", tenantId),
    supabase
      .from("agent_integration_bindings")
      .select(`id, integration_id, capability_id, enabled, policy, is_mock, capabilities!inner(${CAPABILITY_COLUMNS})`)
      .eq("tenant_id", tenantId)
      .eq("agent_key", agentKey),
    supabase.from("provider_capabilities").select("provider, capability_id, implemented"),
  ]);

  const bindings = (bindingRows ?? []).map((row) => {
    const cap = row.capabilities as never as Parameters<typeof mapCapability>[0];
    return {
      id: row.id,
      integrationId: row.integration_id,
      capabilityId: row.capability_id,
      capabilityKey: cap.capability_key,
      capabilityName: cap.display_name,
      enabled: Boolean(row.enabled),
      policy: (row.policy ?? {}) as Record<string, unknown>,
      isMock: Boolean(row.is_mock),
    };
  });

  const capsById = new Map(agentCapabilities.map((c) => [c.id, c]));

  const views = (integrations ?? []).map((i) => {
    const forProvider = (providerCaps ?? []).filter((p) => p.provider === i.provider);
    const compatible = forProvider
      .filter((p) => agentCapIds.has(p.capability_id))
      .map((p) => {
        const cap = capsById.get(p.capability_id)!;
        return {
          ...cap,
          implemented: Boolean(p.implemented),
          bound: bindings.some((b) => b.integrationId === i.id && b.capabilityId === cap.id),
        };
      });

    const boundHere = bindings.filter((b) => b.integrationId === i.id && b.enabled);
    const stale =
      i.last_sync_at ? Date.now() - new Date(i.last_sync_at).getTime() > STALE_AFTER_MS : false;

    let state: DataSourceState;
    if (!compatible.length) state = "capability_unavailable";
    else if (i.status !== "connected") state = "unhealthy";
    else if (i.health_status && i.health_status !== "healthy" && i.health_status !== "unknown")
      state = "unhealthy";
    else if (!boundHere.length) state = "connected_not_bound";
    else if (stale) state = "stale";
    else state = "active";

    return {
      integrationId: i.id,
      provider: i.provider,
      displayName: i.display_name ?? i.provider,
      orgName: i.external_org_name,
      status: i.status,
      healthStatus: i.health_status,
      lastSyncAt: i.last_sync_at,
      isMock: Boolean(i.is_mock),
      state,
      compatibleCapabilities: compatible,
      ...(compatible.length
        ? {}
        : {
            incompatibleReason:
              "This integration does not currently expose a capability supported by this agent.",
          }),
    };
  });

  return { bindings, integrations: views, agentCapabilities };
}

/** Creates a binding after re-validating agent + provider capability support. */
export async function createBinding(
  supabase: UserClient,
  ctx: TenantContext,
  userId: string,
  input: { agentKey: string; integrationId: string; capabilityKey: string },
) {
  const { data: agent } = await supabase
    .from("agent_definitions")
    .select("agent_key")
    .eq("agent_key", input.agentKey)
    .maybeSingle();
  if (!agent) throw new BindingError("unknown_agent", BINDING_ERRORS['unknown_agent']!);

  const { data: cap } = await supabase
    .from("capabilities")
    .select("id")
    .eq("capability_key", input.capabilityKey)
    .maybeSingle();
  if (!cap) throw new BindingError("unknown_capability", BINDING_ERRORS['unknown_capability']!);

  const { data: agentCap } = await supabase
    .from("agent_capabilities")
    .select("id")
    .eq("agent_key", input.agentKey)
    .eq("capability_id", cap.id)
    .maybeSingle();
  if (!agentCap)
    throw new BindingError(
      "capability_not_supported_by_agent",
      BINDING_ERRORS['capability_not_supported_by_agent']!,
    );

  const { data: integration } = await supabase
    .from("integrations")
    .select("id, provider, is_mock")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", input.integrationId)
    .maybeSingle();
  if (!integration)
    throw new BindingError("integration_not_found", BINDING_ERRORS['integration_not_found']!);

  const { data: providerCap } = await supabase
    .from("provider_capabilities")
    .select("id")
    .eq("provider", integration.provider)
    .eq("capability_id", cap.id)
    .maybeSingle();
  if (!providerCap)
    throw new BindingError(
      "capability_not_supported_by_provider",
      BINDING_ERRORS['capability_not_supported_by_provider']!,
    );

  const { error } = await supabase.from("agent_integration_bindings").upsert(
    {
      tenant_id: ctx.tenantId,
      agent_key: input.agentKey,
      integration_id: integration.id,
      capability_id: cap.id,
      enabled: true,
      is_mock: Boolean(integration.is_mock),
      created_by: userId,
    },
    { onConflict: "tenant_id,agent_key,integration_id,capability_id" },
  );
  if (error) {
    console.error("[bindings] create failed", error.message);
    throw new BindingError("save_failed", BINDING_ERRORS['save_failed']!);
  }
}

export async function removeBinding(
  supabase: UserClient,
  ctx: TenantContext,
  bindingId: string,
) {
  const { error } = await supabase
    .from("agent_integration_bindings")
    .delete()
    .eq("id", bindingId)
    .eq("tenant_id", ctx.tenantId);
  if (error) throw new BindingError("save_failed", BINDING_ERRORS['save_failed']!);
}

export async function setBindingState(
  supabase: UserClient,
  ctx: TenantContext,
  input: { bindingId: string; enabled?: boolean; policy?: Record<string, unknown> },
) {
  const patch: Record<string, unknown> = {};
  if (typeof input.enabled === "boolean") patch['enabled'] = input.enabled;
  if (input.policy) patch['policy'] = input.policy;
  if (!Object.keys(patch).length) return;

  const { error } = await supabase
    .from("agent_integration_bindings")
    .update(patch as never)
    .eq("id", input.bindingId)
    .eq("tenant_id", ctx.tenantId);
  if (error) throw new BindingError("save_failed", BINDING_ERRORS['save_failed']!);
}

export interface AgentSettings {
  preInstructions: string;
  systemInstructions: string;
  postInstructions: string;
}

export async function getAgentSettings(
  supabase: UserClient,
  tenantId: string,
  agentKey: string,
): Promise<AgentSettings> {
  const { data } = await supabase
    .from("agent_settings")
    .select("pre_instructions, system_instructions, post_instructions")
    .eq("tenant_id", tenantId)
    .eq("agent_key", agentKey)
    .maybeSingle();

  return {
    preInstructions: data?.pre_instructions ?? "",
    systemInstructions: data?.system_instructions ?? "",
    postInstructions: data?.post_instructions ?? "",
  };
}

export async function saveAgentSettings(
  supabase: UserClient,
  ctx: TenantContext,
  userId: string,
  input: { agentKey: string } & AgentSettings,
) {
  const { error } = await supabase.from("agent_settings").upsert(
    {
      tenant_id: ctx.tenantId,
      agent_key: input.agentKey,
      pre_instructions: input.preInstructions,
      system_instructions: input.systemInstructions,
      post_instructions: input.postInstructions,
      updated_by: userId,
    },
    { onConflict: "tenant_id,agent_key" },
  );
  if (error) {
    console.error("[agent-settings] save failed", error.message);
    throw new BindingError("save_failed", BINDING_ERRORS['save_failed']!);
  }
}
