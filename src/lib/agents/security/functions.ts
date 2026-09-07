import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { githubCapabilityRouter } from "@/lib/capabilities/github-router.server";
import { analyzeSecurityFindings } from "./analysis";
import { SECURITY_AGENT_KEY } from "./types";

export const executeSecurityAgent = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { now?: number } = {}) => ({ now: typeof input.now === "number" ? input.now : Date.now() })).handler(async ({ data, context }) => {
  const now = data.now;
  try {
    const routed = await githubCapabilityRouter.getSecurityFindings(context.supabase, context.userId, SECURITY_AGENT_KEY, { now });
    if (routed.denied) return { ok: false as const, error: { code: "capability_denied", message: routed.denied.message }, meta: routed };
    const entries = Object.entries(routed.policies);
    if (!entries.length || !routed.records.length) {
      return { ok: true as const, data: { recommendations: [], evaluatedCount: 0, excludedCount: 0, exceededRepositoryCeiling: false }, meta: routed };
    }
    const results = entries.map(([integrationId, entry]) => ({ integrationId, result: analyzeSecurityFindings(routed.records.filter((f) => f.integrationId === integrationId), entry.policy, entry.revision, now) }));
    return {
      ok: true as const,
      data: {
        recommendations: results.flatMap((r) => r.result.recommendations),
        evaluatedCount: results.reduce((n, r) => n + r.result.evaluatedCount, 0),
        excludedCount: results.reduce((n, r) => n + r.result.excludedCount, 0),
        exceededRepositoryCeiling: results.some((r) => r.result.exceededRepositoryCeiling),
      },
      meta: routed,
    };
  } catch (error) {
    console.error("[security-agent] execution failed", { error: error instanceof Error ? error.message : "unknown error" });
    return { ok: false as const, error: { code: "unavailable", message: "Security Agent could not evaluate the connected GitHub evidence." }, meta: { evaluatedAt: new Date(now).toISOString(), warnings: [], sources: [], records: [], policies: {} } };
  }
});
