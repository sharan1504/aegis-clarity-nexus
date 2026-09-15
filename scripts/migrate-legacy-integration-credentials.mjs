import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
if (!url || !serviceKey || !keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AEGIS_CREDENTIAL_ENCRYPTION_KEY (64 hex chars).");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const key = Buffer.from(keyHex, "hex");
function encrypt(value) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key, iv); const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]); return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join("."); }

const { data: legacy, error: legacyError } = await db.from("integration_credentials").select("integration_id,tenant_id,client_id,client_secret,access_token,refresh_token,token_type,expires_at,scopes");
if (legacyError) throw legacyError;
for (const row of legacy ?? []) {
  const { data: integration, error } = await db.from("integrations").select("id,tenant_id,provider,status,display_name,metadata").eq("id", row.integration_id).maybeSingle();
  if (error) throw error; if (!integration) continue;
  const credentials = { clientId: row.client_id, clientSecret: row.client_secret, accessToken: row.access_token, refreshToken: row.refresh_token, tokenType: row.token_type, expiresAt: row.expires_at, scopes: row.scopes };
  const { error: upsertError } = await db.from("provider_connections").upsert({ id: integration.id, tenant_id: integration.tenant_id, provider: integration.provider, display_name: integration.display_name, environment: integration.metadata?.environment ?? "Production", status: integration.status === "connected" ? "connected" : "failed", encrypted_credentials: encrypt(credentials), credential_expires_at: row.expires_at, last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (upsertError) throw upsertError;
  console.log(`migrated ${integration.provider} integration ${integration.id}`);
}
console.log(`Migration complete: ${legacy?.length ?? 0} legacy credential rows processed.`);
