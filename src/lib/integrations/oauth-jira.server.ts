import { createPkcePair, createOAuthState, consumeOAuthState, getAdminClient, readConnectionCredentials, storeOAuthConnection } from "./oauth-framework.server";

export const JIRA_SCOPES = ["read:jira-work", "read:jira-user"] as const;
const AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";

export function buildJiraAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("audience", "api.atlassian.com");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("scope", JIRA_SCOPES.join(" "));
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function exchangeAuthorizationCode(input: { code: string; clientId: string; clientSecret: string; redirectUri: string; codeVerifier: string }) {
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", client_id: input.clientId, client_secret: input.clientSecret, code: input.code, redirect_uri: input.redirectUri, code_verifier: input.codeVerifier }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Jira OAuth token exchange failed (${response.status}): ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!body.access_token) throw new Error("Jira OAuth did not return an access token.");
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, expiresAt: new Date(Date.now() + Number(body.expires_in ?? 3600) * 1000).toISOString(), scopes: body.scope?.split(/\s+/).filter(Boolean) ?? [...JIRA_SCOPES] };
}

async function resolveCloudId(accessToken: string) {
  const response = await fetch(RESOURCES_URL, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Jira accessible-resources failed (${response.status}): ${text.slice(0, 300)}`);
  const sites = JSON.parse(text) as Array<{ id?: string; name?: string; url?: string }>;
  const site = sites.find((item) => item.id);
  if (!site?.id) throw new Error("Jira returned no accessible site for this connection.");
  return site;
}

export async function startJiraOAuth(input: { tenantId: string; userId: string; connectionId?: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) {
  const db = await getAdminClient();
  const connectionId = input.connectionId ?? crypto.randomUUID();
  const { verifier, challenge } = createPkcePair();
  const pending = { clientId: input.clientId.trim(), clientSecret: input.clientSecret, provider: "jira", oauth: true };
  const encrypted = (await import("./credential-vault.server")).encryptCredentials(pending);
  await db.from("provider_connections").upsert({ id: connectionId, tenant_id: input.tenantId, provider: "jira", display_name: input.displayName ?? null, environment: input.environment ?? "Production", status: "failed", encrypted_credentials: encrypted, last_error: "OAuth authorization in progress", updated_at: new Date().toISOString() }, { onConflict: "id" });
  const state = await createOAuthState(db, { tenantId: input.tenantId, provider: "jira", redirectUri: input.redirectUri, connectionId, codeVerifier: verifier });
  return { connectionId, authorizeUrl: buildJiraAuthorizeUrl({ clientId: input.clientId, redirectUri: input.redirectUri, state, codeChallenge: challenge }) };
}

export async function completeJiraOAuth(state: string, code: string) {
  const db = await getAdminClient();
  const stateRecord = await consumeOAuthState(db, state, "jira");
  const credentials = await readConnectionCredentials<{ clientId: string; clientSecret: string }>(db, stateRecord.connectionId, stateRecord.tenantId);
  const tokens = await exchangeAuthorizationCode({ code, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stateRecord.redirectUri, codeVerifier: stateRecord.codeVerifier ?? "" });
  const site = await resolveCloudId(tokens.accessToken);
  await storeOAuthConnection(db, { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, provider: "jira", externalId: site.id, displayName: site.name ?? "Jira", credentials: { ...credentials, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, cloudId: site.id, siteUrl: site.url, scopes: tokens.scopes }, expiresAt: tokens.expiresAt });
  return { connectionId: stateRecord.connectionId, tenantId: stateRecord.tenantId, cloudId: site.id, displayName: site.name ?? "Jira" };
}
