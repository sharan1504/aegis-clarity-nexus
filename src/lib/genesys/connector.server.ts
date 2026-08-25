// Server-only Genesys Cloud connector.
// READ ONLY: this connector never issues write/mutating calls to Genesys.
import { GENESYS_SCOPES, IntegrationError, normalizeGenesysRegion } from "./errors";

export interface GenesysTokens { accessToken: string; refreshToken: string | null; tokenType: string; expiresAt: string; scopes: string[]; }
export interface GenesysOrg { id: string; name: string; thirdPartyOrgName?: string | null; }
export interface GenesysMe { id: string; name: string; email: string | null; }
export interface GenesysUserRecord { id: string; name: string | null; email: string | null; title: string | null; department: string | null; state: string | null; presence: string | null; licenseName: string | null; divisionName: string | null; lastLoginAt: string | null; dateCreated: string | null; raw: unknown; }
export interface GenesysLicenseRecord { id: string; name: string | null; permissions: string[]; assignedCount: number; raw: unknown; }
export interface GenesysQueueRecord { id: string; name: string | null; description: string | null; divisionName: string | null; memberCount: number | null; mediaSettings: unknown; dateCreated: string | null; raw: unknown; }

function region(regionId?: string | null) { return normalizeGenesysRegion(regionId); }
function loginHost(regionId?: string | null) { return `https://login.${region(regionId)}`; }
function apiHost(regionId?: string | null) { return `https://api.${region(regionId)}`; }

export interface GenesysClientCredentials { clientId: string; clientSecret: string; }

/**
 * Per-instance client credentials win; the server-level GENESYS_CLIENT_ID /
 * GENESYS_CLIENT_SECRET remain only as a backward-compatible fallback for the
 * original single connection.
 */
export function resolveClientCredentials(credentials?: GenesysClientCredentials | null): GenesysClientCredentials {
  if (credentials?.clientId && credentials?.clientSecret) return { clientId: credentials.clientId, clientSecret: credentials.clientSecret };
  return getClientCredentials();
}

export function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env["GENESYS_CLIENT_ID"];
  const clientSecret = process.env["GENESYS_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new IntegrationError("not_configured");
  return { clientId, clientSecret };
}
export function isConfigured(): boolean { return Boolean(process.env["GENESYS_CLIENT_ID"] && process.env["GENESYS_CLIENT_SECRET"]); }

export function buildAuthorizeUrl(opts: { redirectUri: string; state: string; regionId?: string | null; credentials?: GenesysClientCredentials | null }): string {
  const { clientId } = resolveClientCredentials(opts.credentials);
  const url = new URL(`${loginHost(opts.regionId)}/oauth/authorize`);
  url.searchParams.set("response_type", "code"); url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri); url.searchParams.set("state", opts.state);
  url.searchParams.set("scope", GENESYS_SCOPES.join(" ")); return url.toString();
}

async function tokenRequest(body: Record<string, string>, regionId?: string | null, credentials?: GenesysClientCredentials | null): Promise<GenesysTokens> {
  const { clientId, clientSecret } = resolveClientCredentials(credentials);
  const basic = typeof btoa === "function" ? btoa(`${clientId}:${clientSecret}`) : Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${loginHost(regionId)}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
  const text = await res.text();
  if (!res.ok) {
    console.error("[genesys] token endpoint error", res.status, text.slice(0, 500));
    if (res.status === 401 || /invalid_client/.test(text)) throw new IntegrationError("invalid_client", text.slice(0, 300), res.status);
    if (res.status === 429) throw new IntegrationError("rate_limited", undefined, 429);
    if (/invalid_grant/.test(text)) throw new IntegrationError("connection_revoked", text.slice(0, 300), res.status);
    if (/invalid_scope|insufficient/i.test(text)) throw new IntegrationError("insufficient_scopes", text.slice(0, 300), res.status);
    throw new IntegrationError("oauth_failed", text.slice(0, 300), res.status);
  }
  const json = JSON.parse(text) as { access_token: string; refresh_token?: string; token_type?: string; expires_in?: number; scope?: string };
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, tokenType: json.token_type ?? "Bearer", expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(), scopes: json.scope ? json.scope.split(/[\s,]+/).filter(Boolean) : [...GENESYS_SCOPES] };
}
export function exchangeAuthorizationCode(opts: { code: string; redirectUri: string; regionId?: string | null; credentials?: GenesysClientCredentials | null }): Promise<GenesysTokens> { return tokenRequest({ grant_type: "authorization_code", code: opts.code, redirect_uri: opts.redirectUri }, opts.regionId, opts.credentials); }
export function refreshAccessToken(opts: { refreshToken: string; regionId?: string | null; credentials?: GenesysClientCredentials | null }): Promise<GenesysTokens> { return tokenRequest({ grant_type: "refresh_token", refresh_token: opts.refreshToken }, opts.regionId, opts.credentials); }

async function apiGet<T>(path: string, accessToken: string, regionId?: string | null): Promise<T> {
  const res = await fetch(`${apiHost(regionId)}${path}`, { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
  if (res.ok) return (await res.json()) as T;
  const text = await res.text(); console.error("[genesys] api error", path, res.status, text.slice(0, 500));
  if (res.status === 401) throw new IntegrationError("token_expired", undefined, 401);
  if (res.status === 403) throw new IntegrationError("insufficient_scopes", text.slice(0, 300), 403);
  if (res.status === 404) throw new IntegrationError("org_not_found", path, 404);
  if (res.status === 429) throw new IntegrationError("rate_limited", undefined, 429);
  throw new IntegrationError("provider_error", `${res.status} ${text.slice(0, 300)}`, res.status);
}
async function apiPost<T>(path: string, body: unknown, accessToken: string, regionId?: string | null): Promise<T> {
  const res = await fetch(`${apiHost(regionId)}${path}`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return (await res.json()) as T;
  const text = await res.text(); console.error("[genesys] api error", path, res.status, text.slice(0, 500));
  if (res.status === 401) throw new IntegrationError("token_expired", undefined, 401);
  if (res.status === 403) throw new IntegrationError("insufficient_scopes", text.slice(0, 300), 403);
  if (res.status === 429) throw new IntegrationError("rate_limited", undefined, 429);
  throw new IntegrationError("provider_error", `${res.status} ${text.slice(0, 300)}`, res.status);
}

export async function getOrganization(accessToken: string, regionId?: string | null): Promise<GenesysOrg> {
  const org = await apiGet<{ id?: string; name?: string; thirdPartyOrgName?: string }>("/api/v2/organizations/me", accessToken, regionId);
  if (!org?.id) throw new IntegrationError("org_not_found");
  return { id: org.id, name: org.name ?? org.thirdPartyOrgName ?? "Genesys organization", thirdPartyOrgName: org.thirdPartyOrgName ?? null };
}
export async function getCurrentUser(accessToken: string, regionId?: string | null): Promise<GenesysMe> {
  const me = await apiGet<{ id: string; name?: string; email?: string }>("/api/v2/users/me", accessToken, regionId);
  return { id: me.id, name: me.name ?? "Unknown", email: me.email ?? null };
}

interface Paged<T> { entities?: T[]; pageCount?: number; pageNumber?: number; }
async function pageThrough<T>(buildPath: (page: number) => string, accessToken: string, regionId: string | null | undefined, maxPages = 1000): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const res = await apiGet<Paged<T>>(buildPath(page), accessToken, regionId);
    out.push(...(res.entities ?? []));
    const pageCount = res.pageCount ?? 1;
    if (pageCount > maxPages) {
      throw new IntegrationError("provider_error", `Genesys pagination exceeded the safety limit of ${maxPages} pages.`);
    }
    if (page >= pageCount) break;
    page += 1;
  }
  return out;
}

async function latestObservedUserActivity(accessToken: string, regionId: string | null | undefined): Promise<Map<string, string>> {
  type Presence = { startTime?: string };
  type UserDetail = { userId?: string; primaryPresence?: Presence[]; routingStatus?: Presence[] };
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const body = { interval: `${start.toISOString()}/${end.toISOString()}`, order: "desc", paging: { pageSize: 100, pageNumber: 1 } };
  const response = await apiPost<{ userDetails?: UserDetail[] }>("/api/v2/analytics/users/details/query", body, accessToken, regionId);
  const latest = new Map<string, string>();
  for (const detail of response.userDetails ?? []) {
    const times = [...(detail.primaryPresence ?? []), ...(detail.routingStatus ?? [])].map((x) => x.startTime).filter((x): x is string => Boolean(x));
    if (detail.userId && times.length) latest.set(detail.userId, times.sort().at(-1)!);
  }
  return latest;
}

export async function listUsers(accessToken: string, regionId?: string | null): Promise<GenesysUserRecord[]> {
  type RawUser = { id: string; name?: string; email?: string; title?: string; department?: string; state?: string; presence?: { presenceDefinition?: { systemPresence?: string } }; division?: { name?: string }; dateCreated?: string; dateLastLogin?: string; };
  const users = await pageThrough<RawUser>((p) => `/api/v2/users?pageSize=50&pageNumber=${p}&state=any&expand=presence`, accessToken, regionId);
  let activity = new Map<string, string>();
  try { activity = await latestObservedUserActivity(accessToken, regionId); } catch (error) { console.warn("[genesys] analytics activity enrichment unavailable; continuing with user login data", error instanceof Error ? error.message : "unknown error"); }
  return users.map((u) => ({ id: u.id, name: u.name ?? null, email: u.email ?? null, title: u.title ?? null, department: u.department ?? null, state: u.state ?? null, presence: u.presence?.presenceDefinition?.systemPresence ?? null, licenseName: null, divisionName: u.division?.name ?? null, lastLoginAt: activity.get(u.id) ?? u.dateLastLogin ?? null, dateCreated: u.dateCreated ?? null, raw: u }));
}

export interface GenesysUserLicenseAssignment { genesysUserId: string; licenseIds: string[]; }
export async function listUserLicenseAssignments(accessToken: string, regionId?: string | null): Promise<GenesysUserLicenseAssignment[]> {
  type Assignment = { id: string; licenses?: string[] };
  const assignments = await pageThrough<Assignment>((p) => `/api/v2/license/users?pageSize=100&pageNumber=${p}`, accessToken, regionId, 50);
  return assignments.filter((a) => Boolean(a?.id)).map((a) => ({ genesysUserId: a.id, licenseIds: Array.from(new Set((a.licenses ?? []).filter(Boolean))) }));
}
export async function listLicenses(accessToken: string, regionId?: string | null, assignments: GenesysUserLicenseAssignment[] = []): Promise<GenesysLicenseRecord[]> {
  type Definition = { id: string; name?: string; permissions?: unknown };
  const definitions = await apiGet<Definition[] | Paged<Definition>>("/api/v2/license/definitions", accessToken, regionId);
  const defs = Array.isArray(definitions) ? definitions : (definitions.entities ?? []); const counts = new Map<string, number>();
  for (const a of assignments) for (const licenseId of a.licenseIds) counts.set(licenseId, (counts.get(licenseId) ?? 0) + 1);
  return defs.map((d) => ({ id: d.id, name: d.name ?? null, permissions: Array.isArray(d.permissions) ? d.permissions.filter((p): p is string => typeof p === "string") : [], assignedCount: counts.get(d.id) ?? 0, raw: d }));
}
export async function listQueues(accessToken: string, regionId?: string | null): Promise<GenesysQueueRecord[]> {
  type RawQueue = { id: string; name?: string; description?: string; division?: { name?: string }; memberCount?: number; mediaSettings?: unknown; dateCreated?: string };
  const queues = await pageThrough<RawQueue>((p) => `/api/v2/routing/queues?pageSize=100&pageNumber=${p}`, accessToken, regionId);
  return queues.map((q) => ({ id: q.id, name: q.name ?? null, description: q.description ?? null, divisionName: q.division?.name ?? null, memberCount: q.memberCount ?? null, mediaSettings: q.mediaSettings ?? {}, dateCreated: q.dateCreated ?? null, raw: q }));
}

export async function healthCheck(accessToken: string, regionId?: string | null): Promise<{ org: GenesysOrg; me: GenesysMe }> {
  const [org, me] = await Promise.all([getOrganization(accessToken, regionId), getCurrentUser(accessToken, regionId)]);
  return { org, me };
}
