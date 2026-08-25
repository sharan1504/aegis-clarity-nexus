import crypto from "node:crypto";
import { GENESYS_SCOPES, IntegrationError, normalizeGenesysRegion } from "./errors";
import type { GenesysTokens } from "./connector.server";

export interface InstanceGenesysClientCredentials { clientId: string; clientSecret: string }
export interface InstanceGenesysOrg { id: string; name: string; thirdPartyOrgName?: string | null }
export interface InstanceGenesysMe { id: string; name: string; email: string | null }

type InstanceTokens = GenesysTokens;

function loginHost(regionId?: string | null) { return `https://login.${normalizeGenesysRegion(regionId)}`; }
function apiHost(regionId?: string | null) { return `https://api.${normalizeGenesysRegion(regionId)}`; }

/** PKCE S256 challenge for Genesys Code Authorization / PKCE clients. */
export function createPkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; region: string; codeChallenge?: string }): string {
  if (!input.clientId.trim()) throw new IntegrationError("not_configured");
  const url = new URL(`${loginHost(input.region)}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId.trim());
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", GENESYS_SCOPES.join(" "));
  if (input.codeChallenge) {
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

async function tokenRequest(body: Record<string, string>, region: string, credentials: InstanceGenesysClientCredentials): Promise<InstanceTokens> {
  if (!credentials.clientId || !credentials.clientSecret) throw new IntegrationError("not_configured");
  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const response = await fetch(`${loginHost(region)}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 401 || /invalid_client/i.test(text)) throw new IntegrationError("invalid_client", text.slice(0, 300), response.status);
    if (response.status === 429) throw new IntegrationError("rate_limited", undefined, 429);
    if (/invalid_grant/i.test(text)) throw new IntegrationError("connection_revoked", text.slice(0, 300), response.status);
    if (/invalid_scope|insufficient/i.test(text)) throw new IntegrationError("insufficient_scopes", text.slice(0, 300), response.status);
    throw new IntegrationError("oauth_failed", text.slice(0, 300), response.status);
  }
  const json = JSON.parse(text) as { access_token: string; refresh_token?: string; token_type?: string; expires_in?: number; scope?: string };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    tokenType: json.token_type ?? "Bearer",
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
    scopes: json.scope ? json.scope.split(/[\s,]+/).filter(Boolean) : [...GENESYS_SCOPES],
  };
}

export function exchangeAuthorizationCode(input: { code: string; redirectUri: string; region: string; credentials: InstanceGenesysClientCredentials; codeVerifier?: string }) {
  return tokenRequest({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    ...(input.codeVerifier ? { code_verifier: input.codeVerifier } : {}),
  }, input.region, input.credentials);
}

export function refreshAccessToken(input: { refreshToken: string; region: string; credentials: InstanceGenesysClientCredentials }) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: input.refreshToken }, input.region, input.credentials);
}

async function apiGet<T>(path: string, accessToken: string, region: string): Promise<T> {
  const response = await fetch(`${apiHost(region)}${path}`, { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
  if (response.ok) return (await response.json()) as T;
  const text = await response.text();
  if (response.status === 401) throw new IntegrationError("token_expired", undefined, 401);
  if (response.status === 403) throw new IntegrationError("insufficient_scopes", text.slice(0, 300), 403);
  if (response.status === 429) throw new IntegrationError("rate_limited", undefined, 429);
  throw new IntegrationError("provider_error", `${response.status} ${text.slice(0, 300)}`, response.status);
}

export async function healthCheck(accessToken: string, region: string): Promise<{ org: InstanceGenesysOrg; me: InstanceGenesysMe }> {
  const [org, me] = await Promise.all([
    apiGet<{ id?: string; name?: string; thirdPartyOrgName?: string }>("/api/v2/organizations/me", accessToken, region),
    apiGet<{ id: string; name?: string; email?: string }>("/api/v2/users/me", accessToken, region),
  ]);
  if (!org.id) throw new IntegrationError("org_not_found");
  return {
    org: { id: org.id, name: org.name ?? org.thirdPartyOrgName ?? "Genesys organization", thirdPartyOrgName: org.thirdPartyOrgName ?? null },
    me: { id: me.id, name: me.name ?? "Unknown", email: me.email ?? null },
  };
}
