import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { EnvironmentMode } from "@/lib/environment-mode";

export type TenantResolverClient = SupabaseClient<Database>;

export interface ResolvedTenantContext {
  tenantId: string;
  roles: string[];
  canManage: boolean;
  environmentMode: EnvironmentMode;
}

interface CacheEntry {
  value?: ResolvedTenantContext;
  expiresAt: number;
  pending?: Promise<ResolvedTenantContext>;
}

const CACHE_TTL_MS = 5_000;
const cache = new Map<string, CacheEntry>();

export class TenantResolutionError extends Error {
  readonly code = "no_tenant";

  constructor() {
    super("The user is not attached to a tenant.");
    this.name = "TenantResolutionError";
  }
}

async function loadTenantContext(
  supabase: TenantResolverClient,
  userId: string,
): Promise<ResolvedTenantContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  const tenantId = profile?.tenant_id;
  if (!tenantId) throw new TenantResolutionError();

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);

  const roles = (roleRows ?? []).map((row) => String(row.role));

  const { data: tenant, error: tenantError } = await (supabase as any)
    .from("tenants")
    .select("environment_mode")
    .eq("id", tenantId)
    .single();

  if (tenantError) {
    throw new Error(`Unable to resolve workspace environment: ${tenantError.message}`);
  }

  const environmentMode: EnvironmentMode = tenant?.environment_mode === "demo" ? "demo" : "live";

  return {
    tenantId,
    roles,
    canManage: roles.includes("admin") || roles.includes("manager"),
    environmentMode,
  };
}

/**
 * Resolves a user's tenant, roles and workspace environment once per short-lived
 * server cache window. The in-flight promise is cached too, so concurrent requests
 * share the same database resolution instead of producing a query stampede.
 */
export async function resolveTenantContext(
  supabase: TenantResolverClient,
  userId: string,
): Promise<ResolvedTenantContext> {
  const now = Date.now();
  const existing = cache.get(userId);

  if (existing && existing.expiresAt > now) {
    if (existing.value) return existing.value;
    if (existing.pending) return existing.pending;
  }

  const pending = loadTenantContext(supabase, userId);
  cache.set(userId, { expiresAt: now + CACHE_TTL_MS, pending });

  try {
    const value = await pending;
    cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    cache.delete(userId);
    throw error;
  }
}

/** Test/support hook; does not expose cache contents. */
export function clearTenantContextCache() {
  cache.clear();
}
