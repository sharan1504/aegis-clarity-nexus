type CacheEntry<T> = { value?: T; expiresAt: number; pending?: Promise<T> };

const TTL_MS = 5_000;
const cache = new Map<string, CacheEntry<unknown>>();

function cacheKey(tenantId: string, dataType: string, scope = "default") {
  return `${tenantId}:${dataType}:${scope}`;
}

export async function withEvidenceCache<T>(
  tenantId: string,
  dataType: string,
  scope: string,
  loader: () => Promise<T>,
): Promise<T> {
  const key = cacheKey(tenantId, dataType, scope);
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    if (existing.value !== undefined) return existing.value;
    if (existing.pending) return existing.pending;
  }

  const pending = loader();
  cache.set(key, { pending, expiresAt: now + TTL_MS });
  try {
    const value = await pending;
    cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

export function clearEvidenceCache() {
  cache.clear();
}
