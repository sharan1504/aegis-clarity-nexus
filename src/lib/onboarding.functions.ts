import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import type { OnboardingFeatureKey } from "@/lib/onboarding-config";

const FEATURE_KEYS = new Set<OnboardingFeatureKey>(["command-center", "integrations", "agents", "copilot"]);

export type OnboardingState = {
  eligible: boolean;
  tourCompleted: boolean;
  tourDismissed: boolean;
  visitedFeatures: Partial<Record<OnboardingFeatureKey, boolean>>;
};

function emptyState(): OnboardingState {
  return { eligible: false, tourCompleted: false, tourDismissed: false, visitedFeatures: {} };
}

async function loadState(context: { supabase: any; userId: string }) {
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const db = context.supabase as any;
  const { data, error } = await db
    .from("user_onboarding_state")
    .select("tour_completed,tour_dismissed,visited_features")
    .eq("user_id", context.userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { tenantId, state: emptyState() };

  const visited = typeof data.visited_features === "object" && data.visited_features !== null
    ? Object.fromEntries(
        Object.entries(data.visited_features).filter(([key, value]) => FEATURE_KEYS.has(key as OnboardingFeatureKey) && value === true),
      ) as Partial<Record<OnboardingFeatureKey, boolean>>
    : {};

  return {
    tenantId,
    state: {
      eligible: true,
      tourCompleted: Boolean(data.tour_completed),
      tourDismissed: Boolean(data.tour_dismissed),
      visitedFeatures: visited,
    } satisfies OnboardingState,
  };
}

export const initializeOnboardingState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await resolveTenant(context.supabase, context.userId);
    const db = context.supabase as any;
    const { error } = await db.from("user_onboarding_state").upsert(
      {
        user_id: context.userId,
        tenant_id: tenantId,
        tour_completed: false,
        tour_dismissed: false,
        visited_features: {},
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return loadState(context);
  });

export const getOnboardingState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { state } = await loadState(context);
    return state;
  });

export const saveOnboardingState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const input = (data ?? {}) as {
      tourCompleted?: boolean;
      tourDismissed?: boolean;
      visitedFeature?: string;
    };
    const current = await loadState(context);
    const nextVisited = { ...current.state.visitedFeatures };

    if (input.visitedFeature && FEATURE_KEYS.has(input.visitedFeature as OnboardingFeatureKey)) {
      nextVisited[input.visitedFeature as OnboardingFeatureKey] = true;
    }

    const next = {
      tourCompleted: input.tourCompleted ?? current.state.tourCompleted,
      tourDismissed: input.tourDismissed ?? current.state.tourDismissed,
      visitedFeatures: nextVisited,
    };

    const db = context.supabase as any;
    const { tenantId } = current;
    const { error } = await db.from("user_onboarding_state").upsert(
      {
        user_id: context.userId,
        tenant_id: tenantId,
        tour_completed: next.tourCompleted,
        tour_dismissed: next.tourDismissed,
        visited_features: next.visitedFeatures,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    return {
      eligible: true,
      tourCompleted: next.tourCompleted,
      tourDismissed: next.tourDismissed,
      visitedFeatures: next.visitedFeatures,
    } satisfies OnboardingState;
  });


// Legacy dashboard setup status. Kept separate from discovery onboarding state so
// existing Command Center setup messaging remains backward-compatible.
export const getOnboardingStatus = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  try {
    const { tenantId } = await resolveTenant(context.supabase, context.userId);
    const [providers, bindings, guardrails] = await Promise.all([
      context.supabase.from("integrations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "connected"),
      context.supabase.from("agent_integration_bindings").select("agent_key,enabled").eq("tenant_id", tenantId).eq("enabled", true),
      context.supabase.from("guardrail_revisions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]);
    if (providers.error) throw new Error(providers.error.message);
    if (bindings.error) throw new Error(bindings.error.message);
    if (guardrails.error) throw new Error(guardrails.error.message);
    return {
      providerCount: providers.count ?? 0,
      deployedAgentCount: new Set((bindings.data ?? []).map((row) => String(row.agent_key))).size,
      guardrailCount: guardrails.count ?? 0,
    };
  } catch (error) {
    console.error("[onboarding] status load failed; returning empty setup state", error);
    return { providerCount: 0, deployedAgentCount: 0, guardrailCount: 0 };
  }
});
