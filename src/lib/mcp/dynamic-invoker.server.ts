import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { decryptCredentials } from "@/lib/integrations/credential-vault.server";
import { callExternalMcpTool } from "./external-transport.server";
import type { RegisteredMcpTool } from "./catalog.server";

const db = (supabase: SupabaseClient<Database>) => supabase as unknown as SupabaseClient;

function jsonResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

export async function invokeDynamicMcpTool(supabase: SupabaseClient<Database>, tenantId: string, descriptor: RegisteredMcpTool, input: unknown) {
  if (descriptor.handlerKind === "entity_query") {
    const config = descriptor.handlerConfig ?? {};
    const provider = String(config.provider ?? descriptor.provider ?? "");
    const entityTypes = Array.isArray(config.entityTypes) ? config.entityTypes.map(String).slice(0, 20) : [];
    if (!provider || !entityTypes.length) throw new Error("The MCP entity-query template is incomplete.");
    const result = await db(supabase).from("provider_sync_entities").select("provider,entity_type,entity_key,payload,provider_updated_at,synced_at,stale")
      .eq("tenant_id", tenantId).eq("provider", provider).eq("stale", false).in("entity_type", entityTypes).limit(200);
    if (result.error) throw new Error(result.error.message);
    return jsonResult({ provider, capability: descriptor.capability, evidenceBacked: true, count: (result.data ?? []).length, entities: result.data ?? [] });
  }
  if (descriptor.origin !== "external") throw new Error("This dynamic MCP tool has no runtime handler.");
  const serverId = descriptor.externalServerId;
  const remoteToolName = descriptor.externalToolName;
  if (!serverId || !remoteToolName) throw new Error("External MCP tool metadata is incomplete.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const server = await (supabaseAdmin as any).from("mcp_server_connections").select("id,tenant_id,base_url,auth_type,encrypted_auth,status")
    .eq("id", serverId).eq("tenant_id", tenantId).maybeSingle();
  if (server.error) throw new Error(server.error.message);
  if (!server.data || server.data.status !== "connected") throw new Error("The external MCP server is not connected.");
  const credentials = server.data.encrypted_auth ? decryptCredentials<{ token?: string }>(server.data.encrypted_auth) : {};
  const result = await callExternalMcpTool(server.data.base_url, server.data.auth_type === "bearer" ? credentials.token ?? null : null, remoteToolName, input);
  return jsonResult(result);
}
