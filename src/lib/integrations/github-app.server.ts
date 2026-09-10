/**
 * GitHub App installation support for Aegis.
 *
 * Aegis connects GitHub through an installed GitHub App (Setup URL flow) and
 * mints short-lived installation access tokens on demand. Personal access
 * tokens and user OAuth tokens are never accepted or persisted.
 *
 * Server-only module: GITHUB_APP_PRIVATE_KEY must never reach the browser.
 */
import crypto from "node:crypto";

export const GITHUB_API = "https://api.github.com";
export const GITHUB_API_VERSION = "2022-11-28";
/** Installation-scoped repository collection. Never use /user/repos for app auth. */
export const GITHUB_INSTALLATION_REPOSITORIES_PATH = "/installation/repositories";
export const GITHUB_INSTALLATION_REPOSITORIES_KEY = "repositories";
const STATE_TTL_MS = 10 * 60 * 1000;

export interface GitHubAppConfig {
  appId: string;
  slug: string;
  privateKey: string;
}

export interface GitHubAppInstallState {
  tenantId: string;
  userId: string;
  connectionId?: string;
  displayName?: string;
  environment?: string;
  exp: number;
}

export interface GitHubAppInstallationCredentials {
  authType: "github_app";
  installationId: string;
  accountId: string;
  accountLogin: string;
  accountType: string;
}

export interface GitHubInstallation {
  installationId: string;
  accountId: string;
  accountLogin: string;
  accountType: string;
  repositorySelection: string | null;
}

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function getGitHubAppConfig(env: NodeJS.ProcessEnv = process.env): GitHubAppConfig {
  const appId = env.GITHUB_APP_ID?.trim();
  const slug = env.GITHUB_APP_SLUG?.trim();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId) throw new Error("GITHUB_APP_ID is not configured on the server.");
  if (!slug) throw new Error("GITHUB_APP_SLUG is not configured on the server.");
  if (!privateKey) throw new Error("GITHUB_APP_PRIVATE_KEY is not configured on the server.");
  return { appId, slug, privateKey: normalizePrivateKey(privateKey) };
}

/**
 * Signing key for install state. A dedicated GITHUB_APP_STATE_SECRET is
 * preferred; otherwise the state key is derived (HKDF-SHA256, documented in
 * docs/connectors/github-app.md) from the existing credential encryption key so
 * no new secret is strictly required. The raw encryption key is never used
 * directly for signing.
 */
export function resolveStateSecret(env: NodeJS.ProcessEnv = process.env): Buffer {
  const dedicated = env.GITHUB_APP_STATE_SECRET?.trim();
  if (dedicated) return Buffer.from(dedicated, "utf8");
  const keyHex = env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
  if (keyHex && /^[0-9a-fA-F]{64}$/.test(keyHex)) {
    return Buffer.from(
      crypto.hkdfSync("sha256", Buffer.from(keyHex, "hex"), Buffer.from("aegis-github-app-state", "utf8"), Buffer.from("github-app-install-state", "utf8"), 32),
    );
  }
  throw new Error("GITHUB_APP_STATE_SECRET is not configured on the server.");
}

function stateSignature(body: string, secret: Buffer): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64url");
}

/** Cryptographically signed, short-lived, tenant/user-bound install state. */
export function signInstallState(input: Omit<GitHubAppInstallState, "exp">, secret: Buffer, now = Date.now()): string {
  const payload: GitHubAppInstallState = { ...input, exp: now + STATE_TTL_MS };
  const body = Buffer.from(JSON.stringify({ ...payload, nonce: crypto.randomBytes(16).toString("hex") }), "utf8").toString("base64url");
  return `${body}.${stateSignature(body, secret)}`;
}

export function verifyInstallState(token: string, secret: Buffer, now = Date.now()): GitHubAppInstallState {
  const [body, signature] = String(token ?? "").split(".");
  if (!body || !signature) throw new Error("The GitHub installation state is missing or malformed.");
  const expected = stateSignature(body, secret);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("The GitHub installation state signature is invalid.");
  let parsed: GitHubAppInstallState;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GitHubAppInstallState;
  } catch {
    throw new Error("The GitHub installation state could not be read.");
  }
  if (!parsed.tenantId || !parsed.userId) throw new Error("The GitHub installation state is not bound to a tenant and user.");
  if (!Number.isFinite(parsed.exp) || parsed.exp <= now) throw new Error("The GitHub installation link has expired. Start the installation again from Integrations.");
  return parsed;
}

/** Reject state that was minted for a different tenant or user. */
export function assertStateMatchesActor(state: GitHubAppInstallState, actor: { tenantId: string; userId: string }): void {
  if (state.userId !== actor.userId) throw new Error("The GitHub installation was started by a different user.");
  if (state.tenantId !== actor.tenantId) throw new Error("The GitHub installation was started for a different workspace.");
}

export function buildInstallUrl(slug: string, state: string): string {
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;
}

/** GitHub App JWT (RS256, max 10 minutes) used for /app endpoints. */
export function createAppJwt(config: Pick<GitHubAppConfig, "appId" | "privateKey">, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000) - 60;
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" }), "utf8").toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat, exp: iat + 540, iss: config.appId }), "utf8").toString("base64url");
  const signingInput = `${header}.${payload}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(normalizePrivateKey(config.privateKey)).toString("base64url");
  return `${signingInput}.${signature}`;
}

async function githubJson<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": GITHUB_API_VERSION, "user-agent": "Aegis-AI/1.0", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`GitHub API ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}

/**
 * Verify a returned installation_id against GitHub itself. installation_id from
 * the Setup URL is untrusted input and is never persisted without this check.
 */
export async function getInstallation(installationId: string, config: GitHubAppConfig, nowMs = Date.now()): Promise<GitHubInstallation> {
  if (!/^\d+$/.test(installationId)) throw new Error("The GitHub installation identifier is not valid.");
  const jwt = createAppJwt(config, nowMs);
  const data = await githubJson<{ id: number; app_id?: number; repository_selection?: string; account?: { id?: number; login?: string; type?: string; slug?: string } }>(`/app/installations/${installationId}`, jwt);
  if (String(data.id) !== installationId) throw new Error("GitHub returned a different installation than the one requested.");
  if (data.app_id !== undefined && String(data.app_id) !== config.appId) throw new Error("The installation belongs to a different GitHub App.");
  const accountId = data.account?.id;
  const accountLogin = data.account?.login ?? data.account?.slug;
  if (!accountId || !accountLogin) throw new Error("GitHub did not return the account that installed the app.");
  return { installationId, accountId: String(accountId), accountLogin, accountType: data.account?.type ?? "Organization", repositorySelection: data.repository_selection ?? null };
}

/** Mint a fresh short-lived installation access token. Never persisted. */
export async function mintInstallationToken(installationId: string, config: GitHubAppConfig, nowMs = Date.now()): Promise<{ token: string; expiresAt: string | null }> {
  if (!/^\d+$/.test(installationId)) throw new Error("The GitHub installation identifier is not valid.");
  const jwt = createAppJwt(config, nowMs);
  const data = await githubJson<{ token?: string; expires_at?: string }>(`/app/installations/${installationId}/access_tokens`, jwt, { method: "POST" });
  if (!data.token) throw new Error("GitHub did not return an installation access token.");
  return { token: data.token, expiresAt: data.expires_at ?? null };
}

/** Installation-scoped reachability check. */
export async function verifyInstallationRepositories(token: string): Promise<{ totalCount: number }> {
  const data = await githubJson<{ total_count?: number }>(`${GITHUB_INSTALLATION_REPOSITORIES_PATH}?per_page=1`, token);
  return { totalCount: Number(data.total_count ?? 0) };
}

export function isGitHubAppCredentials(value: unknown): value is GitHubAppInstallationCredentials {
  return !!value && typeof value === "object" && (value as { authType?: string }).authType === "github_app" && typeof (value as { installationId?: unknown }).installationId === "string";
}

/**
 * Single token provider for every GitHub read/health/execution path: always a
 * freshly minted installation token, never a stored user token.
 */
export async function installationTokenForCredentials(credentials: unknown, nowMs = Date.now()): Promise<string> {
  if (!isGitHubAppCredentials(credentials)) {
    throw new Error("This GitHub connection was not created with the GitHub App installation flow. Reconnect GitHub from Integrations to continue.");
  }
  const { token } = await mintInstallationToken(credentials.installationId, getGitHubAppConfig(), nowMs);
  return token;
}
