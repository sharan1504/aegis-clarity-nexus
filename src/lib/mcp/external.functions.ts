import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenantContext } from "@/lib/tenant-context.server";
import { encryptCredentials, decryptCredentials } from "@/lib/integrations/credential-vault.server";

function normalizeBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("External MCP servers must use HTTPS.");
  return url.toString().replace(/\/$/, "");
}
async function rpc(url: string, token: string | null, method: string, params: Record<string, unknown> = {}) {
  const headers: Record<string,string> = { "content-type": "application/json", "accept": "application/json, text/event-stream" };
  if (token) headers.authorization = "Bearer " + token;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }) });
  const body = await response.text();
  if (!response.ok) throw new Error("External MCP request failed (" + response.status + ").");
  try { return JSON.parse(body) as any; } catch { throw new Error("The external MCP server returned a non-JSON response. Streaming transport is not enabled for this connection."); }
}
async function requireManager(context: any) {
  const tenant = await resolveTenantContext(context.supabase, context.userId);
  if (!tenant.canManage) throw new Error("Admin or manager access is required for external MCP servers.");
  return tenant;
}
export const listMcpServers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const tenant = await resolveTenantContext(context.supabase, context.userId);
  const result = await (context.supabase as any).from("mcp_server_connections").select("id,display_name,base_url,auth_type,status,last_discovered_at,last_error,metadata,created_at,updated_at").eq("tenant_id", tenant.tenantId).order("display_name");
  if (result.error) throw new Error(result.error.message);
  return { ok: true as const, servers: result.data ?? [] };
});
export const connectMcpServer = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { displayName: string; baseUrl: string; token?: string }) => ({
  displayName: String(input?.displayName ?? "").trim(), baseUrl: normalizeBaseUrl(String(input?.baseUrl ?? "")), token: String(input?.token ?? "").trim(),
})).handler(async ({ data, context }) => {
  const tenant = await requireManager(context);
  if (!data.displayName) throw new Error("A display name is required.");
  const token = data.token || null;
  const test = await rpc(data.baseUrl, token, "tools/list");
  if (test?.error) throw new Error(String(test.error.message ?? "MCP discovery failed."));
  const result = await (context.supabase as any).from("mcp_server_connections").upsert({
    tenant_id: tenant.tenantId, display_name: data.displayName, base_url: data.baseUrl,
    auth_type: token ? "bearer" : "none", encrypted_auth: token ? encryptCredentials({ token }) : null,
    status: "connected", last_error: null, last_discovered_at: new Date().toISOString(), created_by: context.userId,
  }, { onConflict: "tenant_id,display_name" }).select("id,display_name,status,last_discovered_at").single();
  if (result.error) throw new Error(result.error.message);
  return { ok: true as const, server: result.data, discoveredCount: Array.isArray(test?.result?.tools) ? test.result.tools.length : 0 };
});
export const discoverMcpServerTools = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { serverId: string }) => ({ serverId: String(input?.serverId ?? "").trim() })).handler(async ({ data, context }) => {
  const tenant = await requireManager(context);
  if (!data.serverId) throw new Error("An MCP server is required.");
  const server = await (context.supabase as any).from("mcp_server_connections").select("id,base_url,auth_type,encrypted_auth,status").eq("id",data.serverId).eq("tenant_id",tenant.tenantId).maybeSingle();
  if (server.error) throw new Error(server.error.message);
  if (!server.data) throw new Error("MCP server was not found.");
  const credentials = server.data.encrypted_auth ? decryptCredentials<{ token?: string }>(server.data.encrypted_auth) : {};
  const response = await rpc(server.data.base_url, credentials.token ?? null, "tools/list");
  if (response?.error) throw new Error(String(response.error.message ?? "MCP discovery failed."));
  const tools = Array.isArray(response?.result?.tools) ? response.result.tools : [];
  const created: string[] = [];
  for (const remote of tools) {
    const remoteName = String(remote?.name ?? "").trim();
    if (!remoteName) continue;
    const safe = remoteName.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0,80) || "tool";
    const toolName = "external_" + data.serverId.replace(/-/g,"").slice(0,12) + "_" + safe;
    const upsert = await (context.supabase as any).from("mcp_tool_definitions").upsert({
      tenant_id: tenant.tenantId, tool_name: toolName, title: String(remote?.title ?? remoteName),
      description: String(remote?.description ?? "External MCP tool exposed by the connected customer server."),
      capability_key: "external_tools", provider: "external-mcp", execution_class: "read_only", read_only: true,
      origin: "external", handler_kind: "external_mcp",
      handler_config: { serverId: data.serverId, remoteToolName: remoteName, inputSchema: remote?.inputSchema ?? {} },
      enabled: true, created_by: context.userId,
    }, { onConflict: "tool_name" });
    if (upsert.error) throw new Error(upsert.error.message);
    created.push(toolName);
  }
  await (context.supabase as any).from("mcp_server_connections").update({ status:"connected", last_discovered_at:new Date().toISOString(), last_error:null }).eq("id",data.serverId).eq("tenant_id",tenant.tenantId);
  return { ok: true as const, count: created.length, toolNames: created };
});
export const bindExternalMcpToolToAgent = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { agentKey: string; toolName: string }) => ({
  agentKey:String(input?.agentKey ?? "").trim(), toolName:String(input?.toolName ?? "").trim(),
})).handler(async ({ data, context }) => {
  const tenant = await requireManager(context);
  const tool = await (context.supabase as any).from("mcp_tool_definitions").select("id,origin,enabled,capability_key").eq("tenant_id",tenant.tenantId).eq("tool_name",data.toolName).eq("origin","external").eq("enabled",true).maybeSingle();
  if (tool.error) throw new Error(tool.error.message);
  if (!tool.data) throw new Error("External MCP tool was not found.");
  const result = await (context.supabase as any).from("mcp_tool_agent_bindings").upsert({
    tenant_id:tenant.tenantId, agent_key:data.agentKey, tool_definition_id:tool.data.id, enabled:true, created_by:context.userId,
  }, { onConflict:"tenant_id,agent_key,tool_definition_id" });
  if (result.error) throw new Error(result.error.message);
  return { ok:true as const, agentKey:data.agentKey, toolName:data.toolName };
});
