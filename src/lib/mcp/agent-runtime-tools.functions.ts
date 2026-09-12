import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { getAgentMcpToolAvailability } from "./agent-tool-availability.server";
import { MCP_TOOL_REGISTRY } from "./gateway-catalog";
import { toJsonValue } from "@/lib/json";

function runtimeToolError(error: unknown) {
  return { ok: false as const, error: error instanceof Error ? error.message : "Agent tool invocation failed." };
}

function requestToken(): string {
  const header = getRequest()?.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Authenticated request token is unavailable.");
  return header.slice("Bearer ".length).trim();
}

async function nextEventSequence(supabase: any, runId: string, tenantId: string) {
  const { data, error } = await supabase.from("agent_run_events").select("sequence").eq("run_id", runId).eq("tenant_id", tenantId).order("sequence", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Unable to allocate agent event sequence: ${error.message}`);
  return Number(data?.sequence ?? 0) + 1;
}

export const listAgentRuntimeTools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentKey: string }) => ({ agentKey: String(input.agentKey ?? "").trim() }))
  .handler(async ({ data, context }) => {
    try {
      if (!data.agentKey) throw new Error("An agent key is required.");
      const tenant = await resolveTenantContext(context.supabase, context.userId);
      const tools = await getAgentMcpToolAvailability(context.supabase, data.agentKey);
      return { ok: true as const, tenantId: tenant.tenantId, tools };
    } catch (error) {
      return runtimeToolError(error);
    }
  });

export const invokeAgentRuntimeTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string; toolName: string; input?: unknown }) => ({
    runId: String(input.runId ?? "").trim(),
    toolName: String(input.toolName ?? "").trim(),
    input: input.input ?? {},
  }))
  .handler(async ({ data, context }) => {
    try {
      if (!data.runId) throw new Error("A run id is required.");
      if (!data.toolName) throw new Error("A tool name is required.");

      const tenant = await resolveTenantContext(context.supabase, context.userId);
      const { data: run, error: runError } = await context.supabase
        .from("agent_runs")
        .select("id, tenant_id, agent_key, status, current_step")
        .eq("id", data.runId)
        .eq("tenant_id", tenant.tenantId)
        .single();
      if (runError || !run) throw new Error(runError?.message ?? "Agent run was not found.");
      if (run.status !== "running") throw new Error(`Agent run is not currently able to invoke tools (status: ${run.status}).`);
      if (!["investigate", "policy", "execute"].includes(String(run.current_step ?? ""))) {
        throw new Error(`Tool invocation is not allowed during the ${run.current_step ?? "unknown"} stage.`);
      }

      const availability = await getAgentMcpToolAvailability(context.supabase, run.agent_key);
      const selected = availability.find((tool) => tool.name === data.toolName);
      if (!selected) throw new Error(`Unknown MCP tool: ${data.toolName}`);
      if (!selected.available) throw new Error(selected.reasons.join(" "));

      const result = await MCP_TOOL_REGISTRY.invoke(data.toolName, data.input, {
        isAuthenticated: () => true,
        token: requestToken(),
        userId: context.userId,
      });

      const { error: eventError } = await context.supabase.from("agent_run_events").insert({
        run_id: data.runId,
        tenant_id: tenant.tenantId,
        sequence: await nextEventSequence(context.supabase, data.runId, tenant.tenantId),
        event_type: "tool_call",
        step: run.current_step,
        actor_id: context.userId,
        provider: selected.provider,
        capability_key: selected.capability,
        outcome: (result as { isError?: boolean })?.isError ? "denied" : "completed",
        payload: { toolName: selected.name, actionKey: selected.actionKey },
      });
      if (eventError) console.error("[agent-runtime-tools] event log failed", eventError.message);

      return { ok: true as const, tool: selected, result: toJsonValue(result) };
    } catch (error) {
      return runtimeToolError(error);
    }
  });
