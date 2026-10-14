type CacheEntry<T> = { value?: T; expiresAt: number; generation: number; pending?: Promise<T> };

const TTL_MS = 5_000;
const cache = new Map<string, CacheEntry<unknown>>();

function cacheKey(tenantId: string, dataType: string, scope: string) {
  return `${tenantId}:${dataType}:${scope}`;
}

type SharedCacheClient = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

async function getGeneration(client: SharedCacheClient, tenantId: string): Promise<number> {
  const { data, error } = await client.from("evidence_cache_versions")
    .select("generation").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`Unable to read evidence cache generation: ${error.message}`);
  return Number(data?.generation ?? 1);
}

export async function withEvidenceCache<T>(
  tenantId: string,
  dataType: string,
  scope: string,
  loader: () => Promise<T>,
  client?: SharedCacheClient,
): Promise<T> {
  const key = cacheKey(tenantId, dataType, scope);
  // Without a database client, retain backward-compatible process-local behavior
  // for unit tests and callers that explicitly opt out of shared caching.
  const generation = client ? await getGeneration(client, tenantId) : 1;
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.generation === generation && existing.expiresAt > now) {
    if (existing.value !== undefined) return existing.value;
    if (existing.pending) return existing.pending;
  }

  const pending = (async () => {
    if (client) {
      const { data, error } = await client.from("evidence_cache_entries")
        .select("value,generation,expires_at")
        .eq("tenant_id", tenantId).eq("data_type", dataType).eq("scope_key", scope)
        .eq("generation", generation).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (error) throw new Error(`Unable to read shared evidence cache: ${error.message}`);
      if (data && Number(data.generation) === generation) return data.value as T;
    }
    const value = await loader();
    if (client) {
      const { error } = await client.from("evidence_cache_entries").upsert({
        tenant_id: tenantId, data_type: dataType, scope_key: scope,
        generation, value: value as any,
        expires_at: new Date(Date.now() + TTL_MS).toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,data_type,scope_key" });
      if (error) throw new Error(`Unable to write shared evidence cache: ${error.message}`);
    }
    return value;
  })();
  cache.set(key, { pending, expiresAt: now + TTL_MS, generation });
  try {
    const value = await pending;
    cache.set(key, { value, expiresAt: Date.now() + TTL_MS, generation });
    return value;
  } catch (error) {
    if (cache.get(key)?.pending === pending) cache.delete(key);
    throw error;
  }
}

export async function clearEvidenceCache(client?: SharedCacheClient, tenantId?: string) {
  cache.clear();
  if (!client || !tenantId) return;
  const { error } = await client.rpc("invalidate_evidence_cache", { p_tenant_id: tenantId });
  if (error) throw new Error(`Unable to invalidate shared evidence cache: ${error.message}`);
}
