import { encryptCredentials } from "./credential-vault.server";

/** One-time server-only migration. After each successful encrypted write the plaintext legacy row is deleted. */
export async function migrateLegacyGenesysCredentials() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: legacyRows, error } = await supabaseAdmin.from("integration_credentials").select("integration_id,tenant_id,client_id,client_secret,access_token,refresh_token,token_type,expires_at,scopes");
  if (error) throw new Error(`Unable to read legacy Genesys credentials: ${error.message}`);
  let migrated = 0;
  for (const row of legacyRows ?? []) {
    if (!row.client_id || !row.client_secret) continue;
    const { data: integration } = await supabaseAdmin.from("integrations").select("id,tenant_id,provider,external_org_id,external_org_name,display_name").eq("id", row.integration_id).eq("tenant_id", row.tenant_id).eq("provider", "genesys").maybeSingle();
    if (!integration) continue;
    const encrypted_credentials = encryptCredentials({ provider: "genesys", clientId: row.client_id, clientSecret: row.client_secret, accessToken: row.access_token, refreshToken: row.refresh_token, tokenType: row.token_type, expiresAt: row.expires_at, scopes: row.scopes ?? [] });
    const { error: upsertError } = await (supabaseAdmin.from("provider_connections" as any) as any).upsert({ tenant_id: row.tenant_id, integration_id: row.integration_id, provider: "genesys", external_id: integration.external_org_id, display_name: integration.display_name ?? integration.external_org_name ?? "Genesys Cloud", environment: "Production", status: "connected", encrypted_credentials, credential_expires_at: row.expires_at, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "integration_id" });
    if (upsertError) throw new Error(`Unable to migrate Genesys credentials for ${row.integration_id}: ${upsertError.message}`);
    const { error: deleteError } = await supabaseAdmin.from("integration_credentials").delete().eq("integration_id", row.integration_id).eq("tenant_id", row.tenant_id);
    if (deleteError) throw new Error(`Encrypted copy exists but legacy credential deletion failed for ${row.integration_id}: ${deleteError.message}`);
    migrated += 1;
  }
  return { scanned: legacyRows?.length ?? 0, migrated };
}
