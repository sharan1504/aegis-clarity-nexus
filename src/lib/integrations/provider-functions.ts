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
    const tenantId = roles?.find((r) => r.tenant_id)?.tenant_id;
    const { data: connections } = tenantId
      ? await context.supabase
          .from("provider_connections")
          .select("id,provider,status,display_name,environment,external_id,credential_expires_at,last_sync_at,last_error,connected_at,updated_at")
          .eq("tenant_id", tenantId)
          .order("updated_at", { ascending: false })
      : { data: [] };

    return {
      providers: PROVIDER_REGISTRY.map((p) => ({
        ...p,
        configured: connections?.some((x) => x.provider === p.id && x.status === "connected") ?? false,
        connections: (connections ?? []).filter((x) => x.provider === p.id),
      })),
      connections: connections ?? [],
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
  .inputValidator((input: ProviderConnectionInput & { connectionId?: string; displayName?: string; environment?: string }) => input)
  .handler(async ({ data, context }) => {
    try {
      // Genesys Cloud has a dedicated, server-managed OAuth flow in
      // integrations-genesys.functions.ts. Never send a Genesys connection
      // through this generic credential validator: it does not implement the
      // Genesys provider contract and would otherwise return undefined.
      if ((data.provider as string) === "genesys") {
        return {
          ok: false as const,
          error: "Genesys Cloud must be connected through its OAuth authorization flow.",
        };
      }

      const { data: roles } = await context.supabase.from("user_roles").select("tenant_id,role").eq("user_id", context.userId);
      const tenantId = roles?.find((r) => r.role === "admin" || r.role === "manager")?.tenant_id;
      if (!tenantId) return { ok: false as const, error: "Admin/manager access is required to connect an integration." };
      const result = await validateProviderConnection({ ...data, tenantId });
      const encrypted = result.ok ? encryptCredentials({ accessToken: result.accessToken, refreshToken: result.refreshToken, clientId: data.clientId, clientSecret: data.clientSecret, apiToken: data.apiToken, accessKeyId: data.accessKeyId, secretAccessKey: data.secretAccessKey, sessionToken: data.sessionToken, tenant: data.tenant, baseUrl: data.baseUrl, region: data.region }) : null;
      const displayName = data.displayName?.trim() || result.displayName || null;
      const environment = data.environment?.trim() || "Production";
      const { data: connectionId, error } = await context.supabase.rpc("upsert_provider_connection", {
        p_tenant_id: tenantId,
        p_connection_id: data.connectionId ?? null,
        p_provider: data.provider,
        p_external_id: result.externalId ?? null,
        p_display_name: displayName,
        p_environment: environment,
        p_status: result.status,
        p_encrypted_credentials: encrypted,
        p_credential_expires_at: result.expiresAt ?? null,
        p_last_error: result.error ?? null,
      });
      if (error) throw new Error(error.message);
      return { ok: result.ok, status: result.status, provider: data.provider, displayName, externalId: result.externalId, connectionId, error: result.error };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Connection failed." };
    }
  });
