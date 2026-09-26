import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCopilotResponseCache, copilotCacheKey, COPILOT_CACHE_TTL_MS, getCachedCopilotResponse, isStableCopilotCacheCandidate, setCachedCopilotResponse } from "./copilot-response-cache.server";

describe("copilot response cache", () => {
  beforeEach(() => clearCopilotResponseCache());

  it("only allows stable product questions", () => {
    expect(isStableCopilotCacheCandidate({ message: "What can CenOps do?", productQuestion: true, requiresLiveEvidence: false })).toBe(true);
    expect(isStableCopilotCacheCandidate({ message: "What integrations are connected to my workspace?", productQuestion: true, requiresLiveEvidence: false })).toBe(false);
    expect(isStableCopilotCacheCandidate({ message: "What can CenOps do?", productQuestion: true, requiresLiveEvidence: true })).toBe(false);
  });

  it("isolates tenant, environment, intent and request keys", () => {
    const base = { tenantId: "tenant-a", environmentMode: "live", intent: "platform_overview", message: "What can CenOps do?" };
    const key = copilotCacheKey(base);
    const otherTenant = copilotCacheKey({ ...base, tenantId: "tenant-b" });
    expect(key).not.toBe(otherTenant);
    const value = { safeResult: { answer: "cached" }, fetchedAt: new Date().toISOString() };
    setCachedCopilotResponse(key, value, 1_000);
    expect(getCachedCopilotResponse(key, 1_000)).toEqual(value);
    expect(getCachedCopilotResponse(otherTenant, 1_000)).toBeNull();
  });

  it("expires entries after ten minutes", () => {
    vi.useFakeTimers();
    try {
      const key = copilotCacheKey({ tenantId: "tenant-a", environmentMode: "demo", intent: "platform_overview", message: "What is CenOps?" });
      const value = { safeResult: { answer: "cached" }, fetchedAt: new Date().toISOString() };
      setCachedCopilotResponse(key, value);
      expect(getCachedCopilotResponse(key)).toEqual(value);
      vi.advanceTimersByTime(COPILOT_CACHE_TTL_MS + 1);
      expect(getCachedCopilotResponse(key)).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
