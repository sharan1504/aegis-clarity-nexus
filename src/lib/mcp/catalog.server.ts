import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MCP_TOOL_CATALOG, type McpToolDescriptor } from "./gateway-catalog";

const db = (supabase: SupabaseClient<Database>) => supabase as unknown as SupabaseClient;

export type RegisteredMcpTool = McpToolDescriptor & {
  origin: "builtin" | "auto" | "external";
  handlerKind: string;
  handlerConfig: Record<string, unknown>;
  enabled: boolean;
  externalServerId?: string;
  externalToolName?: string;
};

function fromRow(row: any): RegisteredMcpTool {
  const config = row.handler_config && typeof row.handler_config === "object" ? row.handler_config : {};
  return {
    name: String(row.tool_name), title: String(row.title), description: String(row.description ?? "Governed Aegis MCP tool."),
    capability: row.capability_key ?? null, actionKey: "mcp." + String(row.tool_name),
    executionClass: row.execution_class ?? "read_only", provider: row.provider ?? null,
    readOnly: Boolean(row.read_only), approvalRequired: row.execution_class !== "read_only",
    origin: row.origin ?? "builtin", handlerKind: String(row.handler_kind), handlerConfig: config,
    enabled: Boolean(row.enabled), externalServerId: typeof config.serverId === "string" ? config.serverId : undefined,
    externalToolName: typeof config.remoteToolName === "string" ? config.remoteToolName : undefined,
  };
}

export async function resolveMcpToolCatalog(supabase: SupabaseClient<Database>, _tenantId: string): Promise<RegisteredMcpTool[]> {
  const result = await db(supabase).from("mcp_tool_definitions").select("tool_name,title,description,capability_key,provider,execution_class,read_only,origin,handler_kind,handler_config,enabled").eq("enabled", true);
  if (result.error) throw new Error("Unable to resolve MCP tool definitions: " + result.error.message);
  const dynamic = (result.data ?? []).map(fromRow);
  const byName = new Map(dynamic.map((tool) => [tool.name, tool]));
  for (const builtin of MCP_TOOL_CATALOG) {
    if (!byName.has(builtin.name)) byName.set(builtin.name, { ...builtin, origin: "builtin", handlerKind: "builtin", handlerConfig: {}, enabled: true });
  }
  return [...byName.values()];
}
