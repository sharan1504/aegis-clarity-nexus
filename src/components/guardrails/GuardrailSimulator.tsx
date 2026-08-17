import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DecisionPill, EffectPill, ScopePill, SeverityPill } from "./GuardrailPills";
import { simulateGuardrails } from "@/lib/guardrails.functions";
import {
  ENVIRONMENTS,
  EXECUTION_CLASSES,
  EXECUTION_CLASS_LABELS,
  type GuardrailScope,
} from "@/lib/guardrails/types";
import type { GuardrailVerdict } from "@/lib/guardrails/evaluate";

/**
 * Runs the same server-side evaluation path as real enforcement, so a verdict
 * shown here is authoritative. Nothing is executed.
 */
export function GuardrailSimulator() {
  const simulate = useServerFn(simulateGuardrails);
  const [form, setForm] = useState({
    agentKey: "agent-license",
    provider: "genesys",
    capability: "license_inventory",
    actionKey: "",
    environment: "production",
    executionClass: "destructive",
    affectedRecords: "142",
    confidence: "92",
    freshness: "fresh",
    dataClassification: "confidential",
    hasChangeTicket: false,
    hasApproval: false,
    hasRollbackPlan: false,
  });
  const [verdict, setVerdict] = useState<GuardrailVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const run = useMutation({
    mutationFn: () => simulate({ data: form }),
    onSuccess: (res) => {
      if (res.ok && res.verdict) {
        setVerdict(res.verdict as GuardrailVerdict);
        setError(null);
      } else {
        setVerdict(null);
        setError((res as { errorMessage?: string }).errorMessage ?? "Simulation failed.");
      }
    },
    onError: () => setError("The simulation could not be run."),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Describe an operation</CardTitle>
          <CardDescription>
            Your tenant and role always come from your session — the simulator can only describe
            the operation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Agent" id="sim-agent">
              <Input
                id="sim-agent"
                value={form.agentKey}
                onChange={(e) => set("agentKey", e.target.value)}
              />
            </Field>
            <Field label="Provider" id="sim-provider">
              <Input
                id="sim-provider"
                value={form.provider}
                onChange={(e) => set("provider", e.target.value)}
              />
            </Field>
            <Field label="Capability" id="sim-cap">
              <Input
                id="sim-cap"
                value={form.capability}
                onChange={(e) => set("capability", e.target.value)}
              />
            </Field>
            <Field label="Tool / action key" id="sim-action">
              <Input
                id="sim-action"
                value={form.actionKey}
                onChange={(e) => set("actionKey", e.target.value)}
                placeholder="revoke_license"
              />
            </Field>
            <Field label="Environment">
              <Select value={form.environment} onValueChange={(v) => set("environment", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENTS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Execution class">
              <Select value={form.executionClass} onValueChange={(v) => set("executionClass", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXECUTION_CLASSES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {EXECUTION_CLASS_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Affected records" id="sim-records">
              <Input
                id="sim-records"
                inputMode="numeric"
                value={form.affectedRecords}
                onChange={(e) => set("affectedRecords", e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field label="Confidence (%)" id="sim-conf">
              <Input
                id="sim-conf"
                inputMode="numeric"
                value={form.confidence}
                onChange={(e) => set("confidence", e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field label="Data freshness">
              <Select value={form.freshness} onValueChange={(v) => set("freshness", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["fresh", "aging", "stale", "unavailable"].map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data classification">
              <Select
                value={form.dataClassification}
                onValueChange={(v) => set("dataClassification", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["none", "public", "internal", "confidential", "restricted", "secret"].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SimToggle
              label="Change record attached"
              checked={form.hasChangeTicket}
              onChange={(v) => set("hasChangeTicket", v)}
            />
            <SimToggle
              label="Approval recorded"
              checked={form.hasApproval}
              onChange={(v) => set("hasApproval", v)}
            />
            <SimToggle
              label="Rollback plan present"
              checked={form.hasRollbackPlan}
              onChange={(v) => set("hasRollbackPlan", v)}
            />
          </div>

          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="mr-2 h-4 w-4" />
            )}
            Run simulation
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Verdict</CardTitle>
          <CardDescription>Identical evaluation path to live enforcement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!verdict && !error && (
            <p className="text-sm text-muted-foreground">
              Run a simulation to see which guardrails apply and what they require.
            </p>
          )}
          {verdict && (
            <>
              <DecisionPill decision={verdict.decision} />
              {verdict.requiredActions.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Required before execution
                  </div>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {verdict.requiredActions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Matched guardrails ({verdict.matched.length})
                </div>
                {verdict.matched.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No guardrails matched.</p>
                ) : (
                  <ul className="space-y-2">
                    {verdict.matched.map((m) => (
                      <li key={m.id} className="rounded-lg border border-border p-2">
                        <div className="text-sm font-medium">{m.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <ScopePill scope={m.scope as GuardrailScope} scopeId={m.scopeId} />
                          <SeverityPill severity={m.severity} />
                          <EffectPill effect={m.effect} />
                          {!m.enforced && (
                            <span className="text-[11px] text-muted-foreground">monitor only</span>
                          )}
                        </div>
                        {m.message && (
                          <p className="mt-1 text-xs text-muted-foreground">{m.message}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {(verdict.maxRecords != null || verdict.redactFields.length > 0 || verdict.escalateTo) && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  {verdict.maxRecords != null && <div>Record cap: {verdict.maxRecords}</div>}
                  {verdict.escalateTo && <div>Escalate to: {verdict.escalateTo}</div>}
                  {verdict.redactFields.length > 0 && (
                    <div>Redacted fields: {verdict.redactFields.join(", ")}</div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function SimToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <span className="text-xs font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
