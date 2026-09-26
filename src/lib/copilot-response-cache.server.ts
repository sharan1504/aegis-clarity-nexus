const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 256;

export type CopilotCacheValue = {
  safeResult: Record<string, unknown>;
  provider?: string;
  model?: string;
  fetchedAt: string;
};

type Entry = { value: CopilotCacheValue; expiresAt: number };
const cache = new Map<string, Entry>();

const normalizeRequest = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
const hasVolatileScope = (value: string) => /\b(my|our|your|this workspace|tenant|connected|configured|enabled|current|today|now|latest|recent|live|status|how many|which .* connected)\b/i.test(value);

export function isStableCopilotCacheCandidate(input: { message: string; productQuestion: boolean; requiresLiveEvidence: boolean }) {
  if (!input.productQuestion || input.requiresLiveEvidence) return false;
  return !hasVolatileScope(input.message);
}

export function copilotCacheKey(input: { tenantId: string; environmentMode: string; intent: string; message: string }) {
  return [input.tenantId, input.environmentMode, input.intent, normalizeRequest(input.message)].join("|");
}

export function getCachedCopilotResponse(key: string, now = Date.now()) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

export function setCachedCopilotResponse(key: string, value: CopilotCacheValue, now = Date.now()) {
  cache.delete(key);
  cache.set(key, { value, expiresAt: now + TTL_MS });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function clearCopilotResponseCache() { cache.clear(); }
export const COPILOT_CACHE_TTL_MS = TTL_MS;
