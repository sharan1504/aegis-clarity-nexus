import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { decryptCredentials } from "@/lib/integrations/credential-vault.server";
import type { RegisteredMcpTool } from "./catalog.server";

const db = (supabase: SupabaseClient<Database>) => supabase as unknown as SupabaseClient;

function jsonResult(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

export async function invokeDynamicMcpTool(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  descriptor: RegisteredMcpTool,
  input: unknown,
) {
  if (descriptor.handlerKind === "entity_query") {
    const config = descriptor.handlerConfig ?? {};
    const provider = String(config.provider ?? descriptor.provider ?? "");
    const entityTypes = Array.isArray(config.entityTypes) ? config.entityTypes.map(String).slice(0, 20) : [];
    if (!provider || !entityTypes.length) throw new Error("The MCP entity-query template is incomplete.");
    const query = db(supabase).from("provider_sync_entities")
      .select("provider,entity_type,entity_key,payload,provider_updated_at,synced_at,stale")
      .eq("tenant_id", tenantId)
      .eq("provider", provider)
      .eq("stale", false)
      .in("entity_type", entityTypes)
      .limit(200);
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    return jsonResult({
      provider,
      capability: descriptor.capability,
      evidenceBacked: true,
      count: (result.data ?? []).length,
      entities: result.data ?? [],
    });
  }

  if (descriptor.origin !== "external") {
    throw new Error("This dynamic MCP tool has no runtime handler.");
  }

  const serverId = descriptor.externalServerId;
  const remoteToolName = descriptor.externalToolName;
  if (!serverId || !remoteToolName) throw new Error("External MCP tool metadata is incomplete.");

  const server = await db(supabase).from("mcp_server_connections")
    .select("id,tenant_id,base_url,auth_type,encrypted_auth,status")
    .eq("id", serverId).eq("tenant_id", tenantId).maybeSingle();
  if (server.error) throw new Error(server.error.message);
  if (!server.data || server.data.status !== "connected") throw new Error("The external MCP server is not connected.");

  const credentials = server.data.encrypted_auth ? decryptCredentials<{ token?: string }>(server.data.encrypted_auth) : {};
  const headers: Record<string,string> = { "content-type": "application/json", "accept": "application/json, text/event-stream" };
  if (server.data.auth_type === "bearer" && credentials.token) headers.authorization = "Bearer " + credentials.token;

  const response = await fetch(server.data.base_url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name: remoteToolName, arguments: input ?? {} } }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error("External MCP tools/call failed (" + response.status + ").");
  let payload: any;
  try { payload = JSON.parse(body); } catch { throw new Error("External MCP server returned a non-JSON response; streaming MCP transports are not enabled for this connection yet."); }
  if (payload?.error) throw new Error(String(payload.error.message ?? "External MCP tool call failed."));
  return jsonResult(payload?.result ?? payload);
}
