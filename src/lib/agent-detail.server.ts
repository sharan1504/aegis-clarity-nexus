import { resolveTenant } from "@/lib/genesys/store.server";

export type UserClientLike = Parameters<typeof resolveTenant>[0];

export interface AgentDetailBinding { integrationId: string; provider: string | null; capabilityKey: string | null; capabilityName: string | null; enabled: boolean; isMock: boolean; }
export interface AgentDetailChange { rowId: string; changeId: string; title: string; stage: string; severity: string; createdAt: string; savings: string; }
export interface AgentDetailActivity { action: string; detail: string | null; actor: string | null; createdAt: string; }

export interface AgentDetail {
  agentKey: string;
  displayName: string;
  description: string | null;
  category: string | null;
  bindings: AgentDetailBinding[];
  operational: boolean;
  telemetry: { aiRequests: number; totalTokens: number; averageLatencyMs: number | null; firstActivityAt: string | null; lastActivityAt: string | null; telemetryAvailable: boolean };
  changes: AgentDetailChange[];
  activity: AgentDetailActivity[];
  savings: { summary: string; entries: Array<{ currency: string; amount: number }> };
  instructions: { pre: string | null; system: string | null; post: string | null };
  generatedAt: string;
}

/** Formats a savings amount, or explicitly reports that no evidence-backed estimate exists. */
const NOT_ESTIMATED = "Not estimated";

export async function loadAgentDetail(supabase: UserClientLike, userId: string, agentKey: string): Promise<AgentDetail | null> {
  const { tenantId } = await resolveTenant(supabase, userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-selected column sets across several tables.
  const db = supabase as any;

  const definition = await db.from("agent_definitions").select("agent_key,display_name,description,category").eq("agent_key", agentKey).maybeSingle();
  if (!definition.data) return null;

  const [bindings, capabilities, integrations, usage, changes, audit, settings] = await Promise.all([
    db.from("agent_integration_bindings").select("integration_id,capability_id,enabled,is_mock").eq("tenant_id", tenantId).eq("agent_key", agentKey),
    db.from("capabilities").select("id,capability_key,display_name"),
    db.from("integrations").select("id,provider").eq("tenant_id", tenantId),
    db.from("ai_usage_events").select("total_tokens,latency_ms,created_at").eq("tenant_id", tenantId).eq("agent_key", agentKey).order("created_at", { ascending: false }).limit(5000),
    db.from("change_records").select("id,change_id,title,stage,severity,created_at,agent,estimated_savings_amount,estimated_savings_currency").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200),
    db.from("audit_log").select("action,detail,actor_email,created_at,payload").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200),
    db.from("agent_settings").select("pre_instructions,system_instructions,post_instructions").eq("tenant_id", tenantId).eq("agent_key", agentKey).maybeSingle(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are shaped by the selects above.
  const capabilityById = new Map<string, any>(((capabilities.data ?? []) as any[]).map((row: any) => [String(row.id), row]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are shaped by the selects above.
  const providerById = new Map<string, string>(((integrations.data ?? []) as any[]).map((row: any) => [String(row.id), String(row.provider)]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are shaped by the selects above.
  const bindingRows: AgentDetailBinding[] = ((bindings.data ?? []) as any[]).map((row: any) => {
    const capability = capabilityById.get(String(row.capability_id));
    return {
      integrationId: String(row.integration_id),
      provider: providerById.get(String(row.integration_id)) ?? null,
      capabilityKey: capability ? String(capability.capability_key) : null,
      capabilityName: capability ? String(capability.display_name) : null,
      enabled: Boolean(row.enabled),
      isMock: Boolean(row.is_mock),
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are shaped by the selects above.
  const usageRows: any[] = usage.data ?? [];
  const totalTokens = usageRows.reduce((sum, row) => sum + Number(row.total_tokens ?? 0), 0);
  const latencySamples = usageRows.filter((row) => Number.isFinite(Number(row.latency_ms)));
  const timestamps = usageRows.map((row) => String(row.created_at)).sort();

  const displayName = String(definition.data.display_name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are shaped by the selects above.
  const relatedChanges: any[] = ((changes.data ?? []) as any[]).filter((row: any) => {
    const agent = String(row.agent ?? "").toLowerCase();
    return agent === agentKey.toLowerCase() || agent === displayName.toLowerCase();
  });

  const savingsByCurrency = new Map<string, number>();
  for (const row of relatedChanges) {
    const amount = Number(row.estimated_savings_amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const currency = String(row.estimated_savings_currency ?? "USD");
    savingsByCurrency.set(currency, (savingsByCurrency.get(currency) ?? 0) + amount);
  }
  const savingsEntries = [...savingsByCurrency.entries()].map(([currency, amount]) => ({ currency, amount }));

  return {
    agentKey,
    displayName,
    description: definition.data.description ? String(definition.data.description) : null,
    category: definition.data.category ? String(definition.data.category) : null,
    bindings: bindingRows,
    operational: bindingRows.some((row) => row.enabled && !row.isMock),
    telemetry: {
      aiRequests: usageRows.length,
      totalTokens,
      averageLatencyMs: latencySamples.length ? Math.round(latencySamples.reduce((sum, row) => sum + Number(row.latency_ms), 0) / latencySamples.length) : null,
      firstActivityAt: timestamps[0] ?? null,
      lastActivityAt: timestamps.length ? timestamps[timestamps.length - 1]! : null,
      telemetryAvailable: usageRows.length > 0,
    },
    changes: relatedChanges.slice(0, 25).map((row) => ({
      rowId: String(row.id),
      changeId: String(row.change_id),
      title: String(row.title),
      stage: String(row.stage),
      severity: String(row.severity ?? "unspecified"),
      createdAt: String(row.created_at),
      savings: Number.isFinite(Number(row.estimated_savings_amount)) && Number(row.estimated_savings_amount) !== 0
        ? `${String(row.estimated_savings_currency ?? "USD")} ${Number(row.estimated_savings_amount).toLocaleString()}`
        : NOT_ESTIMATED,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are shaped by the selects above.
    activity: ((audit.data ?? []) as any[])
      .filter((row: any) => {
        const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
        const agentValue = String(payload.agent ?? payload.agentKey ?? "").toLowerCase();
        return agentValue === agentKey.toLowerCase() || agentValue === displayName.toLowerCase();
      })
      .slice(0, 20)
      .map((row: any) => ({ action: String(row.action), detail: row.detail ? String(row.detail) : null, actor: row.actor_email ? String(row.actor_email) : null, createdAt: String(row.created_at) })),
    savings: {
      summary: savingsEntries.length ? savingsEntries.map((entry) => `${entry.currency} ${entry.amount.toLocaleString()}`).join(" · ") : NOT_ESTIMATED,
      entries: savingsEntries,
    },
    instructions: {
      pre: settings.data?.pre_instructions ? String(settings.data.pre_instructions) : null,
      system: settings.data?.system_instructions ? String(settings.data.system_instructions) : null,
      post: settings.data?.post_instructions ? String(settings.data.post_instructions) : null,
    },
    generatedAt: new Date().toISOString(),
  };
}
