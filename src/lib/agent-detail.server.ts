import { resolveTenant } from "@/lib/genesys/store.server";
import { DEMO_AI_USAGE, DEMO_AGENT_WORKFLOWS, DEMO_CHANGES, DEMO_AUDIT_EVENTS, DEMO_NOW } from "@/lib/demo-data";
import { resolveTenantContext } from "@/lib/tenant-context.server";

export type UserClientLike = Parameters<typeof resolveTenant>[0];
export interface AgentDetailBinding { integrationId: string; provider: string | null; capabilityKey: string | null; capabilityName: string | null; enabled: boolean; isMock: boolean; }
export interface AgentDetailChange { rowId: string; changeId: string; title: string; stage: string; severity: string; createdAt: string; savings: string; }
export interface AgentDetailActivity { action: string; detail: string | null; actor: string | null; createdAt: string; }
export interface AgentWorkflowStep { id: string; name: string; type: string; provider?: string; capability?: string; action: string; requiresApproval?: boolean; verification?: string; }
export type AgentWorkflowConfig = Record<string, string | number | boolean | null>;
export interface AgentWorkflow { trigger: string; description: string; config: AgentWorkflowConfig; steps: AgentWorkflowStep[]; }
export interface AgentDetail {
  agentKey: string; displayName: string; description: string | null; category: string | null;
  bindings: AgentDetailBinding[]; operational: boolean;
  telemetry: { aiRequests: number; totalTokens: number; averageLatencyMs: number | null; firstActivityAt: string | null; lastActivityAt: string | null; telemetryAvailable: boolean };
  changes: AgentDetailChange[]; activity: AgentDetailActivity[];
  savings: { summary: string; entries: Array<{ currency: string; amount: number }> };
  instructions: { pre: string | null; system: string | null; post: string | null };
  workflow: AgentWorkflow | null;
  generatedAt: string;
}
const NOT_ESTIMATED = "Not estimated";

const DEMO_AGENT_META: Record<string, { name: string; description: string; category: string }> = {
  "agent-license": { name: "License Optimization Agent", description: "Finds unused and over-provisioned entitlements across connected platforms.", category: "FinOps" },
  "agent-cost": { name: "Cloud Optimization Agent", description: "Analyses cloud spend and right-sizing opportunities.", category: "FinOps" },
  "agent-security": { name: "Security Agent", description: "Correlates identity and posture findings across platforms.", category: "Security" },
  "agent-incident": { name: "Incident Agent", description: "Triages incidents and correlates service signals.", category: "Operations" },
  "agent-ccx": { name: "Routing Agent", description: "Reviews contact routing, queues, and distribution health.", category: "Operations" },
  "agent-workflow": { name: "Workflow Agent", description: "Coordinates multi-step operational workflows.", category: "Automation" },
  "agent-knowledge": { name: "Knowledge Assistant", description: "Answers operational questions from connected system data.", category: "Productivity" },
};

function demoAgentDetail(agentKey: string): AgentDetail | null {
  const meta = DEMO_AGENT_META[agentKey]; const workflow = DEMO_AGENT_WORKFLOWS[agentKey]; if (!meta || !workflow) return null;
  const usage = DEMO_AI_USAGE.filter((row) => row.agent_key === agentKey);
  const changes = DEMO_CHANGES.filter((row) => row.changeId.includes("104") || agentKey === "agent-security").slice(0, 5);
  const activity = DEMO_AUDIT_EVENTS.filter((row) => row.entityType === "agent" || row.actor.toLowerCase().includes(meta.name.toLowerCase().split(" ")[1] ?? "__never__"));
  return {
    agentKey, displayName: meta.name, description: meta.description, category: meta.category,
    bindings: [{ integrationId: `demo-${agentKey}`, provider: workflow.steps.find((s) => s.provider)?.provider ?? "Aegis Demo", capabilityKey: workflow.steps.find((s) => s.capability)?.capability ?? "workflow", capabilityName: "Demo capability", enabled: true, isMock: true }],
    operational: true,
    telemetry: { aiRequests: usage.length ? usage.length * 18 : 24, totalTokens: usage.reduce((sum, row) => sum + row.total_tokens, 0) || 18420, averageLatencyMs: usage.length ? Math.round(usage.reduce((sum, row) => sum + row.latency_ms, 0) / usage.length) : 940, firstActivityAt: "2026-09-03T06:00:00.000Z", lastActivityAt: DEMO_NOW, telemetryAvailable: true },
    changes: changes.map((row) => ({ rowId: row.id, changeId: row.changeId, title: row.title, stage: row.stage, severity: row.severity, createdAt: row.createdAt, savings: row.id === "demo-change-1" ? "USD 6,120" : row.id === "demo-change-2" ? "USD 3,480" : NOT_ESTIMATED })),
    activity: activity.map((row) => ({ action: row.action, detail: row.detail, actor: row.actor, createdAt: row.createdAt })),
    savings: { summary: agentKey === "agent-license" ? "USD 6,120" : agentKey === "agent-cost" ? "USD 3,480" : NOT_ESTIMATED, entries: agentKey === "agent-license" ? [{ currency: "USD", amount: 6120 }] : agentKey === "agent-cost" ? [{ currency: "USD", amount: 3480 }] : [] },
    instructions: { pre: "Verify evidence freshness before analysis.", system: `Operate as the ${meta.name}. Use only authorized connected capabilities.`, post: "Return evidence, confidence, risk, action and verification status." },
    workflow: workflow as unknown as AgentWorkflow,
    generatedAt: DEMO_NOW,
  };
}

export async function loadAgentDetail(supabase: UserClientLike, userId: string, agentKey: string): Promise<AgentDetail | null> {
  const { environmentMode } = await resolveTenantContext(supabase, userId);
  if (environmentMode === "demo") { const demo = demoAgentDetail(agentKey); if (demo) return demo; }
  const { tenantId } = await resolveTenant(supabase, userId); const db = supabase as any;
  const definition = await db.from("agent_definitions").select("agent_key,display_name,description,category").eq("agent_key", agentKey).maybeSingle();
  if (!definition.data) return null;
  const [bindings, capabilities, integrations, usage, changes, audit, settings] = await Promise.all([
    db.from("agent_integration_bindings").select("integration_id,capability_id,enabled,is_mock").eq("tenant_id", tenantId).eq("agent_key", agentKey),
    db.from("capabilities").select("id,capability_key,display_name"), db.from("integrations").select("id,provider").eq("tenant_id", tenantId),
    db.from("ai_usage_events").select("total_tokens,latency_ms,created_at").eq("tenant_id", tenantId).eq("agent_key", agentKey).order("created_at", { ascending: false }).limit(5000),
    db.from("change_records").select("id,change_id,title,stage,severity,created_at,agent,estimated_savings_amount,estimated_savings_currency").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200),
    db.from("audit_log").select("action,detail,actor_email,created_at,payload").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200),
    db.from("agent_settings").select("pre_instructions,system_instructions,post_instructions").eq("tenant_id", tenantId).eq("agent_key", agentKey).maybeSingle(),
  ]);
  const capabilityById = new Map<string, any>((capabilities.data ?? []).map((row: any) => [String(row.id), row])); const providerById = new Map<string, string>((integrations.data ?? []).map((row: any) => [String(row.id), String(row.provider)]));
  const bindingRows: AgentDetailBinding[] = (bindings.data ?? []).map((row: any) => { const capability = capabilityById.get(String(row.capability_id)); return { integrationId: String(row.integration_id), provider: providerById.get(String(row.integration_id)) ?? null, capabilityKey: capability?.capability_key ?? null, capabilityName: capability?.display_name ?? null, enabled: Boolean(row.enabled), isMock: Boolean(row.is_mock) }; });
  const usageRows: any[] = usage.data ?? []; const totalTokens = usageRows.reduce((sum, row) => sum + Number(row.total_tokens ?? 0), 0); const latencySamples = usageRows.filter((row) => Number.isFinite(Number(row.latency_ms))); const timestamps = usageRows.map((row) => String(row.created_at)).sort(); const displayName = String(definition.data.display_name);
  const relatedChanges: any[] = (changes.data ?? []).filter((row: any) => { const agent = String(row.agent ?? "").toLowerCase(); return agent === agentKey.toLowerCase() || agent === displayName.toLowerCase(); });
  const savingsByCurrency = new Map<string, number>(); for (const row of relatedChanges) { const amount = Number(row.estimated_savings_amount); if (!Number.isFinite(amount) || amount === 0) continue; const currency = String(row.estimated_savings_currency ?? "USD"); savingsByCurrency.set(currency, (savingsByCurrency.get(currency) ?? 0) + amount); }
  const savingsEntries = [...savingsByCurrency.entries()].map(([currency, amount]) => ({ currency, amount }));
  return { agentKey, displayName, description: definition.data.description ? String(definition.data.description) : null, category: definition.data.category ? String(definition.data.category) : null, bindings: bindingRows, operational: bindingRows.some((row) => row.enabled && !row.isMock), telemetry: { aiRequests: usageRows.length, totalTokens, averageLatencyMs: latencySamples.length ? Math.round(latencySamples.reduce((sum, row) => sum + Number(row.latency_ms), 0) / latencySamples.length) : null, firstActivityAt: timestamps[0] ?? null, lastActivityAt: timestamps[timestamps.length - 1] ?? null, telemetryAvailable: usageRows.length > 0 }, changes: relatedChanges.slice(0, 25).map((row) => ({ rowId: String(row.id), changeId: String(row.change_id), title: String(row.title), stage: String(row.stage), severity: String(row.severity ?? "unspecified"), createdAt: String(row.created_at), savings: Number(row.estimated_savings_amount) ? `${String(row.estimated_savings_currency ?? "USD")} ${Number(row.estimated_savings_amount).toLocaleString()}` : NOT_ESTIMATED })), activity: (audit.data ?? []).filter((row: any) => { const payload = row.payload && typeof row.payload === "object" ? row.payload : {}; const value = String(payload.agent ?? payload.agentKey ?? "").toLowerCase(); return value === agentKey.toLowerCase() || value === displayName.toLowerCase(); }).slice(0, 20).map((row: any) => ({ action: String(row.action), detail: row.detail ? String(row.detail) : null, actor: row.actor_email ? String(row.actor_email) : null, createdAt: String(row.created_at) })), savings: { summary: savingsEntries.length ? savingsEntries.map((entry) => `${entry.currency} ${entry.amount.toLocaleString()}`).join(" · ") : NOT_ESTIMATED, entries: savingsEntries }, instructions: { pre: settings.data?.pre_instructions ? String(settings.data.pre_instructions) : null, system: settings.data?.system_instructions ? String(settings.data.system_instructions) : null, post: settings.data?.post_instructions ? String(settings.data.post_instructions) : null }, workflow: null, generatedAt: new Date().toISOString() };
}
