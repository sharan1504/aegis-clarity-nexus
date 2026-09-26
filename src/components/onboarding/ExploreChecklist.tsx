import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Compass } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getOnboardingState, type OnboardingState } from "@/lib/onboarding.functions";
import { DISCOVERY_FEATURES } from "@/lib/onboarding-config";
import { useTenantContext } from "@/lib/tenant";

export function ExploreChecklist({ collapsed = false }: { collapsed?: boolean }) {
  const { tenantId } = useTenantContext();
  const path = useRouterState({ select: (router) => router.location.pathname });
  const load = useServerFn(getOnboardingState);
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const refresh = () => { void load().then(setState).catch(() => undefined); };
    refresh();
    window.addEventListener("cenops:onboarding-updated", refresh);
    return () => window.removeEventListener("cenops:onboarding-updated", refresh);
  }, [tenantId, path, load]);

  const progress = useMemo(() => {
    if (!state?.eligible) return { done: 0, total: 5 };
    const tourSeen = state.tourCompleted || state.tourDismissed;
    const visited = DISCOVERY_FEATURES.filter((feature) => state.visitedFeatures[feature.key]).length;
    return { done: (tourSeen ? 1 : 0) + visited, total: 5 };
  }, [state]);

  const next = DISCOVERY_FEATURES.find((feature) => !state?.visitedFeatures[feature.key]);
  if (!state?.eligible || progress.done >= 4) return null;

  if (collapsed) {
    return (
      <div className="px-2 pb-2">
        <Link to={next?.route ?? "/"} className="flex h-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.05] text-primary" title={"Explore CenOps · " + progress.done + "/" + progress.total}>
          <Compass className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-2 rounded-xl border border-primary/15 bg-primary/[0.04] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Compass className="h-3.5 w-3.5 text-primary" />
        <span>Explore CenOps</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{progress.done}/{progress.total}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: (progress.done / progress.total) * 100 + "%" }} />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {next ? next.label : "You have explored the core CenOps workflow."}
      </div>
      {next && (
        <Link to={next.route as never} className="mt-2 inline-flex items-center text-[11px] font-medium text-primary hover:underline">
          Continue exploring <ArrowRight className="ml-1 h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
