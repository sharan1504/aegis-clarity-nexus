import { useEffect, useState } from "react";
import { Info } from "lucide-react";

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
  INSTRUCTION_CATEGORIES,
  INSTRUCTION_CATEGORY_LABELS,
  INSTRUCTION_SCOPES,
  INSTRUCTION_SCOPE_LABELS,
  INSTRUCTION_TEXT_LIMIT,
  type InstructionRecord,
} from "@/lib/instructions/types";

export interface InstructionDraft {
  id?: string | null;
  name: string;
  description: string | null;
  instructionText: string;
  category: string;
  scope: string;
  scopeId: string | null;
  priority: number;
  enabled: boolean;
}

const EMPTY: InstructionDraft = {
  name: "",
  description: "",
  instructionText: "",
  category: "general",
  scope: "organization",
  scopeId: "",
  priority: 100,
  enabled: true,
};

export function InstructionEditor({
  open,
  onOpenChange,
  editing,
  saving,
  issues,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: InstructionRecord | null;
  saving: boolean;
  issues: Array<{ field: string; message: string }>;
  onSubmit: (draft: InstructionDraft) => void;
}) {
  const [draft, setDraft] = useState<InstructionDraft>(EMPTY);

  useEffect(() => {
    if (!open) return;
    setDraft(
      editing
        ? {
            id: editing.id,
            name: editing.name,
            description: editing.description ?? "",
            instructionText: editing.instructionText,
            category: editing.category,
            scope: editing.scope,
            scopeId: editing.scopeId ?? "",
            priority: editing.priority,
            enabled: editing.enabled,
          }
        : EMPTY,
    );
  }, [open, editing]);

  const set = <K extends keyof InstructionDraft>(key: K, value: InstructionDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const issueFor = (field: string) => issues.find((i) => i.field === field)?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit instruction" : "New instruction"}</DialogTitle>
          <DialogDescription>
            Instructions shape how agents communicate and prioritise. They are advisory guidance —
            they cannot grant permissions, relax a guardrail, or approve an operation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Need to <strong>prevent</strong> something rather than advise on it? Create a guardrail
            instead — guardrails are enforced by the server before an operation runs.
          </span>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ins-name">Name</Label>
            <Input
              id="ins-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Always name the affected queue in summaries"
            />
            {issueFor("name") && <p className="text-xs text-destructive">{issueFor("name")}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ins-desc">Why this exists (optional)</Label>
            <Input
              id="ins-desc"
              value={draft.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Context for the next administrator who reads this"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ins-text">Guidance</Label>
            <Textarea
              id="ins-text"
              rows={7}
              value={draft.instructionText}
              onChange={(e) => set("instructionText", e.target.value.slice(0, INSTRUCTION_TEXT_LIMIT))}
              placeholder={
                "Write plainly, as you would brief a new analyst. For example:\n" +
                "Use UK spelling. Refer to queues by their business name, not their ID. When a finding affects licensing spend, state the monthly figure first."
              }
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{issueFor("instructionText") ?? "Advisory only — never a permission."}</span>
              <span>
                {draft.instructionText.length}/{INSTRUCTION_TEXT_LIMIT}
              </span>
            </div>
            {issueFor("instructionText") && (
              <p className="text-xs text-destructive">{issueFor("instructionText")}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Applies to</Label>
              <Select value={draft.scope} onValueChange={(v) => set("scope", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUCTION_SCOPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {INSTRUCTION_SCOPE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {issueFor("scope") && <p className="text-xs text-destructive">{issueFor("scope")}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ins-scope-id">
                {draft.scope === "organization" ? "Target (not needed)" : "Target"}
              </Label>
              <Input
                id="ins-scope-id"
                value={draft.scopeId ?? ""}
                disabled={draft.scope === "organization"}
                onChange={(e) => set("scopeId", e.target.value)}
                placeholder={
                  draft.scope === "agent"
                    ? "agent-license"
                    : draft.scope === "integration"
                      ? "genesys"
                      : "license_inventory"
                }
              />
              {issueFor("scopeId") && (
                <p className="text-xs text-destructive">{issueFor("scopeId")}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={draft.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUCTION_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {INSTRUCTION_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ins-priority">Order (lower is read first)</Label>
              <Input
                id="ins-priority"
                inputMode="numeric"
                value={String(draft.priority)}
                onChange={(e) => set("priority", Number(e.target.value.replace(/\D/g, "") || 0))}
              />
              {issueFor("priority") && (
                <p className="text-xs text-destructive">{issueFor("priority")}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Active</div>
              <p className="text-xs text-muted-foreground">
                Inactive instructions are kept for reference but never sent to an agent.
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => set("enabled", v)}
              aria-label="Instruction active"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(draft)} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create instruction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
