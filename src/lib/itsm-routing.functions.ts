import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface StoredCredentials { accessToken?: string; baseUrl?: string; }
function decryptCredentials(value: string): StoredCredentials {
  const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("Credential encryption is not configured on the server.");
  const [ivText, tagText, ciphertextText] = value.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Stored provider credentials are invalid.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8")) as StoredCredentials;
}
async function requestJson(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`ITSM provider discovery failed (${response.status}).`);
  return body;
}

export const discoverItsmRouting = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { integrationId: string; provider: "jira" | "servicenow" }) => input).handler(async ({ data, context }) => {
  const { data: integration, error } = await context.supabase.from("integrations").select("id,tenant_id,provider,status,is_mock").eq("id", data.integrationId).eq("tenant_id", context.tenantId).maybeSingle();
  if (error) throw error;
  if (!integration || integration.provider !== data.provider || integration.status !== "connected" || integration.is_mock) throw new Error("Select a real connected ITSM integration.");
  const { data: connection, error: connectionError } = await context.supabase.from("provider_connections").select("encrypted_credentials,status").eq("tenant_id", context.tenantId).eq("provider", data.provider).maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection?.encrypted_credentials || connection.status !== "connected") throw new Error(`${data.provider} credentials are not available for discovery.`);
  const credentials = decryptCredentials(connection.encrypted_credentials);
  if (!credentials.accessToken) throw new Error(`${data.provider} is connected without an access token.`);

  if (data.provider === "jira") {
    const resources = await requestJson("https://api.atlassian.com/oauth/token/accessible-resources", credentials.accessToken);
    const site = Array.isArray(resources) ? resources.find((item: any) => item.id) : null;
    const cloudId = String(site?.id ?? "");
    if (!cloudId) throw new Error("Jira returned no accessible site.");
    const root = `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}`;
    const projects = await requestJson(`${root}/rest/api/3/project/search?maxResults=200`, credentials.accessToken);
    const issueTypes = await requestJson(`${root}/rest/api/3/issuetype`, credentials.accessToken);
    return { provider: "jira" as const, projects: (projects.values ?? []).map((p: any) => ({ id: String(p.id), key: String(p.key), name: String(p.name) })), issueTypes: (Array.isArray(issueTypes) ? issueTypes : []).map((t: any) => ({ id: String(t.id), name: String(t.name) })), categories: [] };
  }

  const baseUrl = credentials.baseUrl?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("ServiceNow connection is missing its instance URL.");
  const groups = await requestJson(`${baseUrl}/api/now/table/sys_user_group?sysparm_fields=sys_id,name&sysparm_limit=200&sysparm_query=active=true^ORDERBYname`, credentials.accessToken);
  const categories = await requestJson(`${baseUrl}/api/now/table/sys_choice?sysparm_fields=value,label&sysparm_limit=200&sysparm_query=name=change_request^element=category^inactive=false^ORDERBYlabel`, credentials.accessToken);
  return { provider: "servicenow" as const, projects: [], issueTypes: [{ id: "change_request", name: "Change Request" }], categories: (categories.result ?? []).map((c: any) => ({ id: String(c.value), name: String(c.label) })), assignmentGroups: (groups.result ?? []).map((g: any) => ({ id: String(g.sys_id), name: String(g.name) })) };
});
