import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DATA_CLASSIFICATIONS,
  ENFORCEMENT_MODES,
  ENVIRONMENTS,
  EXECUTION_CLASSES,
  EXECUTION_CLASS_LABELS,
  GUARDRAIL_EFFECTS,
  GUARDRAIL_SEVERITIES,
  GUARDRAIL_TYPES,
  GUARDRAIL_TYPE_LABELS,
  EFFECT_LABELS,
  SCOPE_LABELS,
  SCOPE_PRECEDENCE,
  describeGuardrail,
  type GuardrailConditions,
  type GuardrailRecord,
  type GuardrailScope,
} from "@/lib/guardrails/types";

/** Everything the server's GuardrailInput accepts. */
export interface GuardrailDraft {
  id?: string | null;
  name: string;
  description: string | null;
  scope: string;
  scopeId: string | null;
  guardrailType: string;
  enabled: boolean;
  priority: number;
  severity: string;
  enforcementMode: string;
  conditions: Record<string, unknown>;
  action: Record<string, unknown>;
  message: string | null;
}

const AUTHORABLE_SCOPES = SCOPE_PRECEDENCE.filter((s) => s !== "platform");

const FRESHNESS_OPTIONS = ["fresh", "aging", "stale", "unavailable"] as const;

interface FormState {
  name: string;
  description: string;
  scope: GuardrailScope;
  scopeId: string;
  guardrailType: string;
  severity: string;
  enforcementMode: string;
  priority: string;
  message: string;
  environment: string;
  executionClass: string;
  isWrite: boolean;
  isDestructive: boolean;
  affectedRecordsGt: string;
  confidenceLt: string;
  requireFresh: boolean;
  dataClassification: string;
  requireChangeTicket: boolean;
  effect: string;
  maxRecords: string;
  escalateTo: string;
  redactFields: string;
}

const EMPTY: FormState = {
  name: "",
  description: "",
  scope: "organization",
  scopeId: "",
  guardrailType: "require_approval",
  severity: "high",
  enforcementMode: "enforce",
  priority: "100",
  message: "",
  environment: "any",
  executionClass: "any",
  isWrite: true,
  isDestructive: false,
  affectedRecordsGt: "",
  confidenceLt: "",
  requireFresh: false,
  dataClassification: "any",
  requireChangeTicket: false,
  effect: "require_approval",
  maxRecords: "",
  escalateTo: "",
  redactFields: "",
};

function fromRecord(g: GuardrailRecord): FormState {
  const c = g.conditions;
  return {
    name: g.name,
    description: g.description ?? "",
    scope: g.scope,
    scopeId: g.scopeId ?? "",
    guardrailType: g.guardrailType,
    severity: g.severity,
    enforcementMode: g.enforcementMode,
    priority: String(g.priority),
    message: g.message ?? g.action.message ?? "",
    environment: c.environment ?? "any",
    executionClass: c.execution_class ?? "any",
    isWrite: c.is_write === true,
    isDestructive: c.is_destructive === true,
    affectedRecordsGt: c.affected_records_gt != null ? String(c.affected_records_gt) : "",
    confidenceLt: c.confidence_lt != null ? String(c.confidence_lt) : "",
    requireFresh: Array.isArray(c.freshness_in) && c.freshness_in.length > 0,
    dataClassification: c.data_classification ?? "any",
    requireChangeTicket: c.has_change_ticket === false,
    effect: g.action.effect,
    maxRecords: g.action.max_records != null ? String(g.action.max_records) : "",
    escalateTo: g.action.escalate_to ?? "",
    redactFields: (g.action.redact_fields ?? []).join(", "),
  };
}

function toDraft(form: FormState, id?: string | null, enabled = true): GuardrailDraft {
  const conditions: Record<string, unknown> = {};
  if (form.environment !== "any") conditions["environment"] = form.environment;
  if (form.executionClass !== "any") conditions["execution_class"] = form.executionClass;
  if (form.isWrite) conditions["is_write"] = true;
  if (form.isDestructive) conditions["is_destructive"] = true;
  if (form.affectedRecordsGt) conditions["affected_records_gt"] = Number(form.affectedRecordsGt);
  if (form.confidenceLt) conditions["confidence_lt"] = Number(form.confidenceLt);
  if (form.requireFresh) conditions["freshness_in"] = ["stale", "unavailable"];
  if (form.dataClassification !== "any") conditions["data_classification"] = form.dataClassification;
  if (form.requireChangeTicket) conditions["has_change_ticket"] = false;

  const action: Record<string, unknown> = { effect: form.effect };
  if (form.maxRecords) action["max_records"] = Number(form.maxRecords);
  if (form.escalateTo.trim()) action["escalate_to"] = form.escalateTo.trim();
  const redact = form.redactFields
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (redact.length) action["redact_fields"] = redact;
  if (form.message.trim()) action["message"] = form.message.trim();

  return {
    id: id ?? null,
    name: form.name,
    description: form.description.trim() || null,
    scope: form.scope,
    scopeId: form.scope === "organization" ? null : form.scopeId.trim() || null,
    guardrailType: form.guardrailType,
    enabled,
    priority: Number(form.priority) || 100,
    severity: form.severity,
    enforcementMode: form.enforcementMode,
    conditions,
    action,
    message: form.message.trim() || null,
  };
}

export function GuardrailEditor({
  open,
  onOpenChange,
  editing,
  onSubmit,
  saving,
  issues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: GuardrailRecord | null;
  onSubmit: (draft: GuardrailDraft) => void;
  saving: boolean;
  issues: Array<{ field: string; message: string }>;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (open) setForm(editing ? fromRecord(editing) : EMPTY);
  }, [open, editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const draftPreview = toDraft(form);
  const preview = describeGuardrail({
    scope: form.scope,
    scopeId: form.scope === "organization" ? null : form.scopeId || null,
    conditions: draftPreview.conditions as unknown as GuardrailConditions,
    action: draftPreview.action as unknown as GuardrailRecord["action"],
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit guardrail" : "New guardrail"}</DialogTitle>
          <DialogDescription>
            Guardrails are enforced server-side on every protected operation. Agents, prompts,
            tools and workflows cannot weaken or bypass them.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="gr-name">Name</Label>
            <Input
              id="gr-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Require approval for entitlement revocations"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="gr-desc">Description</Label>
            <Textarea
              id="gr-desc"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Why this control exists and who owns it."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Scope</Label>
              <Select value={form.scope} onValueChange={(v) => set("scope", v as GuardrailScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTHORABLE_SCOPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCOPE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gr-scope-id">Applies to</Label>
              <Input
                id="gr-scope-id"
                disabled={form.scope === "organization"}
                value={form.scope === "organization" ? "" : form.scopeId}
                onChange={(e) => set("scopeId", e.target.value)}
                placeholder={
                  form.scope === "organization"
                    ? "Whole organization"
                    : form.scope === "agent"
                      ? "agent-license"
                      : form.scope === "integration"
                        ? "genesys"
                        : form.scope === "capability"
                          ? "license_inventory"
                          : form.scope === "environment"
                            ? "production"
                            : "revoke_license"
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Guardrail type</Label>
              <Select value={form.guardrailType} onValueChange={(v) => set("guardrailType", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUARDRAIL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {GUARDRAIL_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Effect when matched</Label>
              <Select value={form.effect} onValueChange={(v) => set("effect", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUARDRAIL_EFFECTS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {EFFECT_LABELS[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Conditions
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Environment</Label>
                <Select value={form.environment} onValueChange={(v) => set("environment", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any environment</SelectItem>
                    {ENVIRONMENTS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Execution class</Label>
                <Select value={form.executionClass} onValueChange={(v) => set("executionClass", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any class</SelectItem>
                    {EXECUTION_CLASSES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {EXECUTION_CLASS_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gr-records">Affected records above</Label>
                <Input
                  id="gr-records"
                  inputMode="numeric"
                  value={form.affectedRecordsGt}
                  onChange={(e) => set("affectedRecordsGt", e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 25"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gr-conf">Confidence below (%)</Label>
                <Input
                  id="gr-conf"
                  inputMode="numeric"
                  value={form.confidenceLt}
                  onChange={(e) => set("confidenceLt", e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 95"
                />
              </div>
              <div className="grid gap-2">
                <Label>Data classification</Label>
                <Select
                  value={form.dataClassification}
                  onValueChange={(v) => set("dataClassification", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any classification</SelectItem>
                    {DATA_CLASSIFICATIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gr-priority">Priority (1 = first)</Label>
                <Input
                  id="gr-priority"
                  inputMode="numeric"
                  value={form.priority}
                  onChange={(e) => set("priority", e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <Toggle
                label="Only write operations"
                hint="Reads are never matched by this guardrail"
                checked={form.isWrite}
                onChange={(v) => set("isWrite", v)}
              />
              <Toggle
                label="Only destructive operations"
                hint="Deletions, revocations, and irreversible changes"
                checked={form.isDestructive}
                onChange={(v) => set("isDestructive", v)}
              />
              <Toggle
                label="Only when data is stale or unavailable"
                hint={`Matches freshness in ${FRESHNESS_OPTIONS.slice(2).join(", ")}`}
                checked={form.requireFresh}
                onChange={(v) => set("requireFresh", v)}
              />
              <Toggle
                label="Only when no change record is attached"
                hint="Use with Require change record"
                checked={form.requireChangeTicket}
                onChange={(v) => set("requireChangeTicket", v)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={(v) => set("severity", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUARDRAIL_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Enforcement</Label>
              <Select value={form.enforcementMode} onValueChange={(v) => set("enforcementMode", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENFORCEMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m === "enforce" ? "Enforce (binding)" : "Monitor (log only)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gr-max">Record cap</Label>
              <Input
                id="gr-max"
                inputMode="numeric"
                value={form.maxRecords}
                onChange={(e) => set("maxRecords", e.target.value.replace(/\D/g, ""))}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="gr-esc">Escalate to</Label>
              <Input
                id="gr-esc"
                value={form.escalateTo}
                onChange={(e) => set("escalateTo", e.target.value)}
                placeholder="Security Operations"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gr-redact">Redact fields (comma separated)</Label>
              <Input
                id="gr-redact"
                value={form.redactFields}
                onChange={(e) => set("redactFields", e.target.value)}
                placeholder="userEmail, phoneNumber"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="gr-msg">Message shown when matched</Label>
            <Input
              id="gr-msg"
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
              placeholder="Entitlement revocations require an approved change record."
            />
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Reads as: </span>
            {preview}
          </div>

          {issues.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>
                  <span className="font-medium">{issue.field}</span> — {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() => onSubmit(toDraft(form, editing?.id ?? null, editing?.enabled ?? true))}
          >
            {saving ? "Saving…" : editing ? "Save guardrail" : "Create guardrail"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
