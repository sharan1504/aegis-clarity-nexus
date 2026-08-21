import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROVIDER_REGISTRY } from "./provider-registry";
import { validateProviderConnection, type ProviderConnectionInput, type ProviderId } from "./production-connectors.server";

function encryptCredentials(value: unknown): string {
  const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("AEGIS_CREDENTIAL_ENCRYPTION_KEY is not configured on the server.");
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export const getProviderCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("tenant_id,role").eq("user_id", context.userId);
    const tenantId = roles?.[0]?.tenant_id;
    const { data: connections } = tenantId ? await context.supabase.from("provider_connections").select("provider,status,display_name,external_id,credential_expires_at,last_sync_at,last_error").eq("tenant_id", tenantId) : { data: [] };
    return {
      providers: PROVIDER_REGISTRY.map((p) => {
        const c = connections?.find((x) => x.provider === p.id);
        return { ...p, configured: c?.status === "connected", connection: c ?? null };
      }),
    };
  });

export const startProviderConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { provider: string }) => ({ provider: String(input.provider ?? "").trim().toLowerCase() as ProviderId }))
  .handler(async ({ data }) => {
    const provider = PROVIDER_REGISTRY.find((p) => p.id === data.provider);
    if (!provider) return { ok: false as const, errorCode: "provider_not_supported", errorMessage: "Provider is not registered." };
    return { ok: true as const, provider, requiresCredentials: true };
  });

export const connectProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ProviderConnectionInput) => input)
  .handler(async ({ data, context }) => {
    try {
      const { data: roles } = await context.supabase.from("user_roles").select("tenant_id,role").eq("user_id", context.userId);
      const tenantId = roles?.find((r) => r.role === "admin" || r.role === "manager")?.tenant_id;
      if (!tenantId) return { ok: false as const, error: "Admin/manager access is required to connect an integration." };
      const result = await validateProviderConnection({ ...data, tenantId });
      const encrypted = result.ok ? encryptCredentials({ accessToken: result.accessToken, refreshToken: result.refreshToken, clientId: data.clientId, clientSecret: data.clientSecret, apiToken: data.apiToken, tenant: data.tenant, baseUrl: data.baseUrl, region: data.region }) : null;
      const { error } = await context.supabase.rpc("upsert_provider_connection", {
        p_tenant_id: tenantId,
        p_provider: data.provider,
        p_external_id: result.externalId ?? null,
        p_display_name: result.displayName ?? null,
        p_status: result.status,
        p_encrypted_credentials: encrypted,
        p_credential_expires_at: result.expiresAt ?? null,
        p_last_error: result.error ?? null,
      });
      if (error) throw new Error(error.message);
      return { ok: result.ok, status: result.status, provider: data.provider, displayName: result.displayName, externalId: result.externalId, error: result.error };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Connection failed." };
    }
  });
