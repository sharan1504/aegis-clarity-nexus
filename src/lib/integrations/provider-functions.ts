import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROVIDER_REGISTRY } from "./provider-registry";

export const getProviderCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    providers: PROVIDER_REGISTRY.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description,
      auth: p.auth,
      scopes: p.scopes,
      capabilities: p.capabilities,
      configured: p.id === "genesys" ? Boolean(process.env.GENESYS_CLIENT_ID && process.env.GENESYS_CLIENT_SECRET) : false,
    })),
  }));

/**
 * Deliberately does not fake connections. Providers without a server-side
 * connector return a deterministic unsupported response until their OAuth
 * exchange, credential vaulting and sync implementation is actually wired.
 */
export const startProviderConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { provider: string; region?: string }) => ({
    provider: String(input.provider ?? "").trim().toLowerCase(),
    region: input.region ? String(input.region).trim() : undefined,
  }))
  .handler(async ({ data, context }) => {
    const provider = PROVIDER_REGISTRY.find((p) => p.id === data.provider);
    if (!provider) return { ok: false as const, errorCode: "provider_not_supported", errorMessage: "Provider is not registered." };

    if (provider.id === "genesys") {
      const genesys = await import("../integrations-genesys.functions");
      return genesys.startGenesysOAuth({ data: { region: data.region ?? "us-east-1", redirectUri: `${new URL(context.request.url).origin}/integrations/genesys/callback` }, context });
    }

    return {
      ok: false as const,
      errorCode: "provider_not_implemented",
      errorMessage: `${provider.name} is registered but its production connector is not enabled yet. No simulated Connected state is allowed.`,
    };
  });
