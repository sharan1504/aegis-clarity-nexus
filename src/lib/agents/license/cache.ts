// Server-only cache abstraction for License Agent.
// Production should back this interface with Redis/Upstash rather than an
// in-process Map so it remains correct across multiple server instances.

export interface LicenseCacheEntry<T> {
  value: T;
  dataVersion: string;
  cachedAt: string;
  expiresAt: string;
}

export interface LicenseCache {
  get<T>(key: string): Promise<LicenseCacheEntry<T> | null>;
  set<T>(key: string, entry: LicenseCacheEntry<T>): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Build a tenant/user scoped cache key. Never put credentials or secrets in keys. */
export function licenseCacheKey(
  tenantId: string,
  userId: string,
  operation: string,
  normalizedQuery: string,
  dataVersion: string,
): string {
  return [
    "aegis",
    "license",
    tenantId,
    userId,
    dataVersion,
    operation,
    normalizedQuery.trim().toLowerCase().replace(/\s+/g, " "),
  ].join(":");
}

export function normalizeLicenseQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
