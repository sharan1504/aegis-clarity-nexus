import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { saveOnboardingState } from "@/lib/onboarding.functions";
import { TOUR_STEPS } from "@/lib/onboarding-config";

export function OnboardingTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const save = useServerFn(saveOnboardingState);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const step = TOUR_STEPS[stepIndex];

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  if (!step) return null;

  const persist = async (patch: { tourCompleted?: boolean; tourDismissed?: boolean }) => {
    setSaving(true);
    try {
      await save({ data: patch });
      window.dispatchEvent(new Event("cenops:onboarding-updated"));
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    try {
      await persist({ tourDismissed: true, tourCompleted: false });
    } catch {
      // Closing onboarding must never block the product.
    } finally {
      onOpenChange(false);
    }
  };

  const next = async () => {
    if (stepIndex === TOUR_STEPS.length - 1) {
      try {
        await persist({ tourCompleted: true, tourDismissed: false });
      } catch {
        // Completion can be retried from the Help entry point.
      } finally {
        onOpenChange(false);
      }
      return;
    }

    if (step.route) await navigate({ to: step.route as never });
    setStepIndex((current) => current + 1);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !saving) void skip(); }}>
      <DialogContent className="max-w-xl overflow-hidden">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-primary">
            <Sparkles className="h-4 w-4" /> CenOps discovery
          </div>
          <DialogTitle className="text-2xl">{step.title}</DialogTitle>
          <DialogDescription className="text-sm leading-6">{step.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Step {stepIndex + 1} of {TOUR_STEPS.length}</span>
            <span>{Math.round(((stepIndex + 1) / TOUR_STEPS.length) * 100)}%</span>
          </div>
          <Progress value={((stepIndex + 1) / TOUR_STEPS.length) * 100} />

          {step.id === "welcome" && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4 text-sm">
              <div className="font-medium">Demo is safe to explore</div>
              <div className="mt-1 text-muted-foreground">
                Sample evidence is deterministic and does not contact external providers. Switch to Live only when you are ready to work with real connected systems.
              </div>
            </div>
          )}

          {step.helpTopic && (
            <Link to="/help" search={{ topic: step.helpTopic }} className="inline-flex items-center text-xs font-medium text-primary hover:underline">
              Learn more about {step.title} <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => void skip()} disabled={saving}>Skip tour</Button>
          <Button type="button" onClick={() => void next()} disabled={saving}>
            {stepIndex === TOUR_STEPS.length - 1 ? <><Check className="mr-1.5 h-4 w-4" />Finish</> : <>{step.cta}<ArrowRight className="ml-1.5 h-4 w-4" /></>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
