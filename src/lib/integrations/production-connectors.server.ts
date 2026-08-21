import crypto from "node:crypto";

export type ProviderId = "aws" | "azure" | "m365" | "jira" | "servicenow" | "salesforce" | "slack" | "github";

export interface ProviderConnectionInput {
  provider: ProviderId;
  tenantId: string;
  baseUrl?: string;
  tenant?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  apiToken?: string;
  region?: string;
}

export interface ProviderConnectionResult {
  ok: boolean;
  provider: ProviderId;
  status: "connected" | "failed";
  externalId?: string;
  displayName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  error?: string;
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

async function jsonRequest(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${typeof body === "object" ? JSON.stringify(body) : String(body)}`);
  return body as Record<string, unknown>;
}

export function oauthState(payload: Record<string, string>): string {
  return Buffer.from(JSON.stringify({ ...payload, nonce: crypto.randomBytes(24).toString("hex") })).toString("base64url");
}

export function providerAuthorizeUrl(provider: ProviderId, input: { state: string; redirectUri: string; clientId: string; scope: string }) {
  const u = new URL(provider === "jira" ? "https://auth.atlassian.com/authorize" : provider === "salesforce" ? "https://login.salesforce.com/services/oauth2/authorize" : provider === "slack" ? "https://slack.com/oauth/v2/authorize" : provider === "github" ? "https://github.com/login/oauth/authorize" : provider === "servicenow" ? `${required(input.clientId, "ServiceNow instance URL")}/oauth_auth.do` : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  u.searchParams.set("client_id", input.clientId);
  u.searchParams.set("redirect_uri", input.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", input.state);
  u.searchParams.set("scope", input.scope);
  if (provider === "jira") u.searchParams.set("audience", "api.atlassian.com");
  return u.toString();
}

export async function validateProviderConnection(input: ProviderConnectionInput): Promise<ProviderConnectionResult> {
  try {
    switch (input.provider) {
      case "m365": {
        const tenant = required(input.tenant, "Microsoft tenant ID");
        const clientId = required(input.clientId, "Microsoft client ID");
        const clientSecret = required(input.clientSecret, "Microsoft client secret");
        const token = await jsonRequest(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }) });
        const accessToken = required(String(token.access_token ?? ""), "Microsoft access token");
        const org = await jsonRequest("https://graph.microsoft.com/v1.0/organization?$select=id,displayName", { headers: { authorization: `Bearer ${accessToken}` } });
        const value = Array.isArray(org.value) ? org.value[0] as Record<string, unknown> : {};
        return { ok: true, provider: input.provider, status: "connected", externalId: String(value.id ?? tenant), displayName: String(value.displayName ?? tenant), accessToken, expiresAt: new Date(Date.now() + Number(token.expires_in ?? 3600) * 1000).toISOString() };
      }
      case "azure": {
        const tenant = required(input.tenant, "Azure tenant ID");
        const clientId = required(input.clientId, "Azure client ID");
        const clientSecret = required(input.clientSecret, "Azure client secret");
        const token = await jsonRequest(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: "https://management.azure.com/.default", grant_type: "client_credentials" }) });
        const accessToken = required(String(token.access_token ?? ""), "Azure access token");
        const subscriptions = await jsonRequest("https://management.azure.com/subscriptions?api-version=2020-01-01", { headers: { authorization: `Bearer ${accessToken}` } });
        return { ok: true, provider: input.provider, status: "connected", externalId: String((subscriptions.value as Array<Record<string, unknown>> | undefined)?.[0]?.subscriptionId ?? tenant), displayName: `${tenant} Azure`, accessToken, expiresAt: new Date(Date.now() + Number(token.expires_in ?? 3600) * 1000).toISOString() };
      }
      case "aws": {
        // AWS does not provide a generic OAuth login for arbitrary customer accounts.
        // Require short-lived credentials or an external role session; never pretend OAuth exists.
        required(input.accessToken, "AWS temporary access token/role credential");
        return { ok: true, provider: input.provider, status: "connected", externalId: input.tenantId, displayName: `AWS ${input.region ?? "account"}` };
      }
      case "jira": {
        required(input.accessToken, "Jira OAuth access token");
        const sites = await jsonRequest("https://api.atlassian.com/oauth/token/accessible-resources", { headers: { authorization: `Bearer ${input.accessToken}` } });
        const first = Array.isArray(sites) ? sites[0] as Record<string, unknown> : {};
        return { ok: true, provider: input.provider, status: "connected", externalId: String(first.id ?? input.tenantId), displayName: String(first.name ?? "Jira site"), accessToken: input.accessToken };
      }
      case "salesforce": {
        required(input.accessToken, "Salesforce OAuth access token");
        const base = required(input.baseUrl, "Salesforce instance URL");
        const org = await jsonRequest(`${base.replace(/\/$/, "")}/services/data/v66.0/connect/organization`, { headers: { authorization: `Bearer ${input.accessToken}` } });
        return { ok: true, provider: input.provider, status: "connected", externalId: String(org.id ?? input.tenantId), displayName: String(org.organizationName ?? "Salesforce"), accessToken: input.accessToken };
      }
      case "slack": {
        required(input.accessToken, "Slack OAuth access token");
        const auth = await jsonRequest("https://slack.com/api/auth.test", { headers: { authorization: `Bearer ${input.accessToken}` } });
        if (auth.ok !== true) throw new Error(String(auth.error ?? "Slack authentication failed."));
        return { ok: true, provider: input.provider, status: "connected", externalId: String(auth.team_id ?? input.tenantId), displayName: String(auth.team ?? "Slack workspace"), accessToken: input.accessToken };
      }
      case "github": {
        required(input.accessToken, "GitHub OAuth access token");
        const org = await jsonRequest("https://api.github.com/user", { headers: { authorization: `Bearer ${input.accessToken}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
        return { ok: true, provider: input.provider, status: "connected", externalId: String(org.id ?? input.tenantId), displayName: String(org.login ?? "GitHub"), accessToken: input.accessToken };
      }
      case "servicenow": {
        required(input.accessToken, "ServiceNow OAuth access token");
        const base = required(input.baseUrl, "ServiceNow instance URL");
        const me = await jsonRequest(`${base.replace(/\/$/, "")}/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id,name`, { headers: { authorization: `Bearer ${input.accessToken}`, accept: "application/json" } });
        const first = Array.isArray(me.result) ? me.result[0] as Record<string, unknown> : {};
        return { ok: true, provider: input.provider, status: "connected", externalId: String(first.sys_id ?? input.tenantId), displayName: String(first.name ?? "ServiceNow"), accessToken: input.accessToken };
      }
    }
  } catch (error) {
    return { ok: false, provider: input.provider, status: "failed", error: error instanceof Error ? error.message : "Provider authentication failed." };
  }
}
