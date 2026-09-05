import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type TenantResolverClient = SupabaseClient<Database>;

export interface ResolvedTenantContext {
  tenantId: string;
  roles: string[];
  canManage: boolean;
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
  return {
    tenantId,
    roles,
    canManage: roles.includes("admin") || roles.includes("manager"),
  };
}

/**
 * Resolves a user's tenant and roles once per short-lived server cache window.
 * The in-flight promise is cached too, so concurrent requests share the same
 * database resolution instead of producing a query stampede.
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
