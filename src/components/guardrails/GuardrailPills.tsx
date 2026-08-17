import { AlertTriangle, CheckCircle2, Eye, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";

import {
  EFFECT_LABELS,
  SCOPE_LABELS,
  type EnforcementMode,
  type GuardrailEffect,
  type GuardrailScope,
  type GuardrailSeverity,
} from "@/lib/guardrails/types";
import type { GuardrailDecision } from "@/lib/guardrails/evaluate";

const base =
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

const SEVERITY_STYLES: Record<GuardrailSeverity, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-primary/10 text-primary border-primary/30",
  high: "bg-warning/20 text-warning-foreground border-warning/40",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

export function SeverityPill({ severity }: { severity: GuardrailSeverity }) {
  return <span className={`${base} ${SEVERITY_STYLES[severity]}`}>{severity}</span>;
}

export function ScopePill({ scope, scopeId }: { scope: GuardrailScope; scopeId?: string | null }) {
  return (
    <span className={`${base} border-border bg-muted text-muted-foreground`}>
      <ShieldAlert className="h-3 w-3" />
      {SCOPE_LABELS[scope]}
      {scopeId ? <span className="font-normal opacity-80">· {scopeId}</span> : null}
    </span>
  );
}

export function EffectPill({ effect }: { effect: GuardrailEffect }) {
  const styles: Record<GuardrailEffect, string> = {
    block: "bg-destructive/15 text-destructive border-destructive/30",
    require_approval: "bg-warning/20 text-warning-foreground border-warning/40",
    require_change_ticket: "bg-warning/20 text-warning-foreground border-warning/40",
    require_confirmation: "bg-primary/10 text-primary border-primary/30",
    escalate: "bg-primary/10 text-primary border-primary/30",
    limit: "bg-muted text-muted-foreground border-border",
    allow: "bg-success/15 text-success border-success/30",
  };
  return <span className={`${base} ${styles[effect]}`}>{EFFECT_LABELS[effect]}</span>;
}

export function ModePill({ mode }: { mode: EnforcementMode }) {
  return mode === "enforce" ? (
    <span className={`${base} border-success/30 bg-success/15 text-success`}>
      <ShieldCheck className="h-3 w-3" /> Enforcing
    </span>
  ) : (
    <span className={`${base} border-border bg-muted text-muted-foreground`}>
      <Eye className="h-3 w-3" /> Monitoring
    </span>
  );
}

const DECISION_LABELS: Record<GuardrailDecision, string> = {
  allow: "Allowed",
  block: "Blocked",
  require_approval: "Approval required",
  require_confirmation: "Confirmation required",
  escalate: "Escalated",
  unavailable: "Denied — governance unavailable",
};

export function DecisionPill({ decision }: { decision: GuardrailDecision | string }) {
  const key = (decision as GuardrailDecision) in DECISION_LABELS ? (decision as GuardrailDecision) : "unavailable";
  const styles: Record<GuardrailDecision, string> = {
    allow: "bg-success/15 text-success border-success/30",
    block: "bg-destructive/15 text-destructive border-destructive/30",
    require_approval: "bg-warning/20 text-warning-foreground border-warning/40",
    require_confirmation: "bg-primary/10 text-primary border-primary/30",
    escalate: "bg-primary/10 text-primary border-primary/30",
    unavailable: "bg-destructive/15 text-destructive border-destructive/30",
  };
  const Icon = key === "allow" ? CheckCircle2 : key === "block" || key === "unavailable" ? ShieldX : AlertTriangle;
  return (
    <span className={`${base} ${styles[key]}`}>
      <Icon className="h-3 w-3" /> {DECISION_LABELS[key]}
    </span>
  );
}
