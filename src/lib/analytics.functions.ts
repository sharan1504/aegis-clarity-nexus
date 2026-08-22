/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase dynamic query adapter; schema is selected at runtime. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { days?: number }) => ({ days: Math.min(90, Math.max(7, Number(input?.days ?? 30))) }))
  .handler(async ({ data, context }) => {
    const { tenantId } = await resolveTenant(context.supabase, context.userId);
    const db = context.supabase as any;
    const since = daysAgo(data.days);
    const now = new Date().toISOString();
    const [audit, auditEvents, users, roles, agents, changes, aiUsage, settings] = await Promise.all([
      db.from("audit_log").select("action,actor_email,entity_type,entity_id,created_at,payload").eq("tenant_id", tenantId).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      db.from("audit_events").select("action,actor_email,resource_type,target_id,created_at,metadata").eq("tenant_id", tenantId).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      db.from("profiles").select("id,created_at").eq("tenant_id", tenantId),
      db.from("user_roles").select("user_id,role,created_at").eq("tenant_id", tenantId),
      db.from("agent_definitions").select("agent_key,display_name,category"),
      db.from("change_records").select("agent,stage,severity,risk,created_at").eq("tenant_id", tenantId).gte("created_at", since),
      db.from("ai_usage_events").select("agent_key,model,input_tokens,output_tokens,total_tokens,latency_ms,created_at").eq("tenant_id", tenantId).gte("created_at", since),
      db.from("tenants").select("analytics_settings").eq("id", tenantId).single(),
    ]);
    const auditRows = [...(audit.data ?? []), ...(auditEvents.data ?? []).map((x: any) => ({ ...x, entity_type: x.resource_type, entity_id: x.target_id, payload: x.metadata }))].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const userRows = users.data ?? []; const roleRows = roles.data ?? []; const changeRows = changes.data ?? []; const usageRows = aiUsage.data ?? [];
    const byAction = (pattern: RegExp) => auditRows.filter((x: any) => pattern.test(String(x.action))).length;
    const totalTokens = usageRows.reduce((sum: number, x: any) => sum + Number(x.total_tokens ?? 0), 0);
    const inputTokens = usageRows.reduce((sum: number, x: any) => sum + Number(x.input_tokens ?? 0), 0);
    const outputTokens = usageRows.reduce((sum: number, x: any) => sum + Number(x.output_tokens ?? 0), 0);
    const avgLatency = usageRows.length ? Math.round(usageRows.reduce((sum: number, x: any) => sum + Number(x.latency_ms ?? 0), 0) / usageRows.length) : 0;
    const agentMap = new Map<string, { name: string; category: string; actions: number; changes: number; tokens: number }>();
    for (const agent of agents.data ?? []) agentMap.set(agent.agent_key, { name: agent.display_name, category: agent.category ?? "Uncategorized", actions: 0, changes: 0, tokens: 0 });
    for (const row of changeRows) { const key = String(row.agent ?? "Unknown"); const current = agentMap.get(key) ?? { name: key, category: "Operations", actions: 0, changes: 0, tokens: 0 }; current.changes += 1; agentMap.set(key, current); }
    for (const row of usageRows) { const current = agentMap.get(row.agent_key) ?? { name: row.agent_key, category: "AI", actions: 0, changes: 0, tokens: 0 }; current.actions += 1; current.tokens += Number(row.total_tokens ?? 0); agentMap.set(row.agent_key, current); }
    const daily = new Map<string, { events: number; changes: number; aiRequests: number }>();
    for (let offset = data.days - 1; offset >= 0; offset -= 1) daily.set(new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10), { events: 0, changes: 0, aiRequests: 0 });
    for (const row of auditRows) { const bucket = daily.get(String(row.created_at).slice(0, 10)); if (bucket) bucket.events += 1; }
    for (const row of changeRows) { const bucket = daily.get(String(row.created_at).slice(0, 10)); if (bucket) bucket.changes += 1; }
    for (const row of usageRows) { const bucket = daily.get(String(row.created_at).slice(0, 10)); if (bucket) bucket.aiRequests += 1; }
    const severityCounts = changeRows.reduce((acc: Record<string, number>, row: any) => { const severity = String(row.severity ?? "unknown").toLowerCase(); acc[severity] = (acc[severity] ?? 0) + 1; return acc; }, {});
    const analyticsSettings = (settings.data?.analytics_settings ?? {}) as Record<string, any>;
    return {
      period: { days: data.days, from: since, to: now },
      platform: { totalEvents: auditRows.length, activeUsers: new Set(auditRows.map((x: any) => x.actor_email).filter(Boolean)).size, totalUsers: userRows.length, connectedRoles: new Set(roleRows.map((x: any) => x.role)).size, changeRecords: changeRows.length, pendingChanges: changeRows.filter((x: any) => ["Proposed", "Owner Review", "Change Created", "Team Approvals", "Ready to Execute"].includes(x.stage)).length },
      userActivity: { additions: byAction(/user\.(added|created|invited)/i), removals: byAction(/user\.(removed|deleted)/i), updates: byAction(/user\.(updated|role_changed|changed)/i), uniqueActors: new Set(auditRows.map((x: any) => x.actor_email).filter(Boolean)).size },
      agents: [...agentMap.values()].sort((a, b) => b.actions + b.changes - (a.actions + a.changes)),
      ai: { requests: usageRows.length, inputTokens, outputTokens, totalTokens, averageLatencyMs: avgLatency },
      trends: [...daily.entries()].map(([date, values]) => ({ date, ...values })),
      severityCounts,
      governance: { serviceLevel: analyticsSettings.serviceLevel ?? { targetSeconds: 30, targetPercent: 80 }, dataMasking: analyticsSettings.dataMasking ?? true, disconnectMetricWindowMinutes: analyticsSettings.disconnectMetricWindowMinutes ?? 30, retentionDays: analyticsSettings.retentionDays ?? 90 },
      recentEvents: auditRows.slice(0, 100),
    };
  });

export const updateAnalyticsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { serviceLevel: { targetSeconds: number; targetPercent: number }; dataMasking: boolean; disconnectMetricWindowMinutes: number; retentionDays: number }) => input)
  .handler(async ({ data, context }) => {
    const { tenantId, roles } = await resolveTenant(context.supabase, context.userId); if (!roles.includes("admin")) throw new Error("Only workspace administrators can update analytics settings.");
    if (data.serviceLevel.targetSeconds < 1 || data.serviceLevel.targetSeconds > 3600) throw new Error("Service level target must be between 1 and 3600 seconds.");
    if (data.serviceLevel.targetPercent < 1 || data.serviceLevel.targetPercent > 100) throw new Error("Service level target percentage must be between 1 and 100.");
    if (data.disconnectMetricWindowMinutes < 1 || data.disconnectMetricWindowMinutes > 240) throw new Error("Disconnect metric window must be between 1 and 240 minutes.");
    if (data.retentionDays < 7 || data.retentionDays > 3650) throw new Error("Analytics retention must be between 7 and 3650 days.");
    const db = context.supabase as any; const { data: current, error: readError } = await db.from("tenants").select("analytics_settings").eq("id", tenantId).single(); if (readError) throw new Error(readError.message);
    const next = { ...(current?.analytics_settings ?? {}), serviceLevel: data.serviceLevel, dataMasking: data.dataMasking, disconnectMetricWindowMinutes: data.disconnectMetricWindowMinutes, retentionDays: data.retentionDays };
    const { error } = await db.from("tenants").update({ analytics_settings: next }).eq("id", tenantId); if (error) throw new Error(error.message); return { ok: true as const };
  });
