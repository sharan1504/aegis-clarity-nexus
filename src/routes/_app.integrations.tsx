import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Plug, Loader2, ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GenesysCard } from "@/components/integrations/GenesysCard";
import { integrations as seed, type Integration } from "@/lib/mock-data";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/integrations")({
  head: () => pageHead({ path: "/integrations", title: "Integrations & Setup Wizard — Aegis AI", description: "Connect Microsoft 365, AWS, Azure, ServiceNow, and more, and resolve integrations that need action with a guided setup wizard." }),
  component: IntegrationsPage,
});

function statusUi(s: string) {
  if (s === "connected")
    return { label: "Connected", cls: "bg-success/15 text-success border-success/30", icon: CheckCircle2 };
  if (s === "action_required")
    return {
      label: "Action required",
      cls: "bg-warning/20 text-warning-foreground border-warning ring-2 ring-warning/40",
      icon: AlertTriangle,
    };
  return { label: "Available", cls: "bg-muted text-muted-foreground border-border", icon: Plug };
}

const STATUS_ORDER: Record<string, number> = { action_required: 0, available: 1, connected: 2 };

type WizardStep = "review" | "authorize" | "verify" | "done";

function IntegrationsPage() {
  // Genesys is a real integration now and renders from live backend state; the
  // remaining providers keep their prototype wizard until they are implemented.
  const [items, setItems] = useState<Integration[]>(seed.filter((i) => i.id !== "genesys"));
  const [target, setTarget] = useState<Integration | null>(null);
  const [step, setStep] = useState<WizardStep>("review");

  const openWizard = (i: Integration) => {
    setTarget(i);
    setStep("review");
  };

  const advance = () => {
    if (!target) return;
    if (step === "review") {
      setStep("authorize");
      // Simulate OAuth popup + callback
      setTimeout(() => setStep("verify"), 1200);
      setTimeout(() => {
        setStep("done");
        setItems((xs) =>
          xs.map((x) =>
            x.id === target.id ? { ...x, status: "connected", lastSync: "just now" } : x,
          ),
        );
      }, 2400);
    } else if (step === "done") {
      setTarget(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect enterprise systems via OAuth 2.0 today, MCP servers as they roll out."
        actions={<Button size="sm" variant="outline">Browse marketplace</Button>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...items]
          .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
          .map((i) => {
            const s = statusUi(i.status);
            return (
              <Card
                key={i.id}
                className={i.status === "action_required" ? "border-warning/60" : undefined}
              >
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-2xl">
                      {i.logo}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{i.name}</CardTitle>
                      <CardDescription>{i.category}</CardDescription>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}
                    >
                      {i.status === "action_required" && (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-70" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
                        </span>
                      )}
                      <s.icon className="h-3 w-3" /> {s.label}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{i.description}</p>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Badge variant="outline" className="font-normal">{i.auth}</Badge>
                      {i.lastSync && <span>• Last sync {i.lastSync}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {i.status === "connected" && (
                      <>
                        <Button size="sm" variant="outline" className="flex-1">Configure</Button>
                        <Button size="sm" variant="ghost">Disconnect</Button>
                      </>
                    )}
                    {i.status === "action_required" && (
                      <Button size="sm" className="flex-1" onClick={() => openWizard(i)}>
                        Reconnect
                      </Button>
                    )}
                    {i.status === "available" && (
                      <Button size="sm" className="flex-1" onClick={() => openWizard(i)}>
                        Connect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {target && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="text-2xl">{target.logo}</span> Connect {target.name}
                </DialogTitle>
                <DialogDescription>
                  {target.auth} • Aegis will only request read scopes required for the {target.category} agent.
                </DialogDescription>
              </DialogHeader>

              <ol className="space-y-3 py-2 text-sm">
                <WizardRow
                  n={1}
                  label="Review permissions"
                  active={step === "review"}
                  done={step !== "review"}
                />
                <WizardRow
                  n={2}
                  label={`Sign in with ${target.auth}`}
                  active={step === "authorize"}
                  done={step === "verify" || step === "done"}
                />
                <WizardRow
                  n={3}
                  label="Verify connection"
                  active={step === "verify"}
                  done={step === "done"}
                />
                <WizardRow n={4} label="Done" active={step === "done"} done={step === "done"} />
              </ol>

              <DialogFooter>
                {step === "review" && (
                  <Button onClick={advance}>
                    Continue <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
                {(step === "authorize" || step === "verify") && (
                  <Button disabled>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    {step === "authorize" ? "Awaiting authorization…" : "Verifying…"}
                  </Button>
                )}
                {step === "done" && (
                  <Button onClick={advance}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> Finish
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WizardRow({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
          done
            ? "bg-success/15 border-success/40 text-success"
            : active
              ? "bg-primary/15 border-primary/40 text-primary"
              : "border-border text-muted-foreground"
        }`}
      >
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
      </span>
      <span className={active || done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}
