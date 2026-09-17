import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptCredentials, decryptCredentials } from "./credential-vault.server";

const STATE_TTL_MS = 10 * 60_000;

type AdminClient = SupabaseClient<any, "public", any>;

export interface OAuthStateRecord {
  state: string;
  tenantId: string;
  provider: string;
  redirectUri: string;
  connectionId: string;
  expiresAt: string;
  metadata?: Record<string, string>;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createOAuthStateValue(): string {
  return `${crypto.randomBytes(32).toString("base64url")}.${crypto.randomBytes(16).toString("hex")}`;
}

export async function createOAuthState(db: AdminClient, input: Omit<OAuthStateRecord, "state" | "expiresAt"> & { codeVerifier?: string }): Promise<string> {
  const state = createOAuthStateValue();
  const metadata = { ...(input.metadata ?? {}) };
  if (input.codeVerifier) metadata.codeVerifier = input.codeVerifier;
  const { error } = await db.from("integration_oauth_states").insert({ state, tenant_id: input.tenantId, provider: input.provider, redirect_uri: input.redirectUri, connection_id: input.connectionId, metadata, expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString() });
  if (error) throw new Error(`Unable to create OAuth state: ${error.message}`);
  return state;
}

export async function consumeOAuthState(db: AdminClient, state: string, expectedProvider: string): Promise<OAuthStateRecord & { codeVerifier?: string }> {
  if (!state.trim()) throw new Error("OAuth state is required.");
  const { data, error } = await db.from("integration_oauth_states").select("state,tenant_id,provider,redirect_uri,connection_id,metadata,expires_at,consumed_at").eq("state", state).maybeSingle();
  if (error) throw new Error(`Unable to validate OAuth state: ${error.message}`);
  if (!data || data.provider !== expectedProvider || data.consumed_at || new Date(data.expires_at).getTime() <= Date.now()) throw new Error("OAuth state is invalid or expired. Please reconnect the integration.");
  const { data: consumedState, error: consumeError } = await db.from("integration_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("state", state).is("consumed_at", null).select("state,tenant_id,provider,redirect_uri,connection_id,metadata,expires_at,consumed_at").maybeSingle();
  if (consumeError) throw new Error(`Unable to consume OAuth state: ${consumeError.message}`);
  if (!consumedState) throw new Error("OAuth state is invalid or already consumed. Please reconnect the integration.");
  const metadata = (consumedState.metadata ?? {}) as Record<string, string>;
  return { state: consumedState.state, tenantId: consumedState.tenant_id, provider: consumedState.provider, redirectUri: consumedState.redirect_uri, connectionId: consumedState.connection_id, expiresAt: consumedState.expires_at, metadata, codeVerifier: metadata.codeVerifier };
}

export function assertFreshExpiry(expiresAt: string | null | undefined, skewMs = 120_000): boolean { if (!expiresAt) return false; return new Date(expiresAt).getTime() - Date.now() > skewMs; }
export function isExpired(expiresAt: string | null | undefined): boolean { return !expiresAt || new Date(expiresAt).getTime() <= Date.now(); }
export async function getAdminClient(): Promise<AdminClient> { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); return supabaseAdmin as AdminClient; }

export async function storeOAuthConnection(db: AdminClient, input: { connectionId: string; tenantId: string; provider: string; displayName?: string | null; environment?: string | null; externalId?: string | null; credentials: Record<string, unknown>; expiresAt?: string | null; status?: "connected" | "failed" | "disconnected"; }) {
  const encrypted = encryptCredentials(input.credentials); const now = new Date().toISOString();
  const { error } = await db.from("provider_connections").upsert({ id: input.connectionId, tenant_id: input.tenantId, provider: input.provider, display_name: input.displayName ?? null, environment: input.environment ?? "Production", external_id: input.externalId ?? null, status: input.status ?? "connected", encrypted_credentials: encrypted, credential_expires_at: input.expiresAt ?? null, last_error: null, connected_at: now, updated_at: now }, { onConflict: "id" });
  if (error) throw new Error(`Unable to store OAuth credentials: ${error.message}`);
}

export async function readConnectionCredentials<T>(db: AdminClient, connectionId: string, tenantId: string): Promise<T> { const { data, error } = await db.from("provider_connections").select("encrypted_credentials").eq("id", connectionId).eq("tenant_id", tenantId).maybeSingle(); if (error) throw new Error(`Unable to read integration credentials: ${error.message}`); if (!data?.encrypted_credentials) throw new Error("Integration credentials are missing. Please reconnect."); return decryptCredentials<T>(data.encrypted_credentials); }
export async function markReconnectRequired(db: AdminClient, connectionId: string, message = "Reconnect required.") { await db.from("provider_connections").update({ status: "failed", last_error: message, updated_at: new Date().toISOString() }).eq("id", connectionId); }
