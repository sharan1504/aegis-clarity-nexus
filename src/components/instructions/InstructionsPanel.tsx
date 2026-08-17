import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { InstructionEditor, type InstructionDraft } from "./InstructionEditor";
import {
  deleteOrganizationInstruction,
  getOrganizationInstructionHistory,
  listOrganizationInstructions,
  previewInstructionGuidance,
  saveOrganizationInstruction,
  setOrganizationInstructionEnabled,
} from "@/lib/instructions.functions";
import {
  INSTRUCTION_CATEGORY_LABELS,
  INSTRUCTION_SCOPE_LABELS,
  type InstructionCategory,
  type InstructionRecord,
  type InstructionScope,
} from "@/lib/instructions/types";

const QUERY_KEY = ["organization-instructions"];

export function InstructionsPanel() {
  const queryClient = useQueryClient();
  const fetchAll = useServerFn(listOrganizationInstructions);
  const save = useServerFn(saveOrganizationInstruction);
  const toggle = useServerFn(setOrganizationInstructionEnabled);
  const remove = useServerFn(deleteOrganizationInstruction);

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: () => fetchAll({}) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const canManage = data?.canManage ?? false;
  const instructions = (data?.instructions ?? []) as InstructionRecord[];

  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<InstructionRecord | null>(null);
  const [issues, setIssues] = useState<Array<{ field: string; message: string }>>([]);
  const [historyFor, setHistoryFor] = useState<InstructionRecord | null>(null);

  const saveMutation = useMutation({
    mutationFn: (draft: InstructionDraft) =>
      save({ data: draft as unknown as Record<string, unknown> }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Instruction saved");
        setEditorOpen(false);
        setIssues([]);
        void invalidate();
      } else {
        const payload = res as {
          errorMessage?: string;
          issues?: Array<{ field: string; message: string }>;
        };
        setIssues(payload.issues ?? []);
        toast.error(payload.errorMessage ?? "The instruction could not be saved.");
      }
    },
    onError: () => toast.error("The instruction could not be saved."),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) => toggle({ data: vars }),
    onSuccess: (res) => {
      if (res.ok) void invalidate();
      else toast.error((res as { errorMessage?: string }).errorMessage ?? "Update failed.");
    },
    onError: () => toast.error("The instruction could not be updated."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Instruction deleted");
        void invalidate();
      } else toast.error((res as { errorMessage?: string }).errorMessage ?? "Delete failed.");
    },
    onError: () => toast.error("The instruction could not be deleted."),
  });

  const term = search.trim().toLowerCase();
  const filtered = term
    ? instructions.filter((i) =>
        [i.name, i.description ?? "", i.instructionText, i.scope, i.scopeId ?? "", i.category]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : instructions;

  const orgWide = filtered.filter((i) => i.scope === "organization");
  const targeted = filtered.filter((i) => i.scope !== "organization");

  return (
    <div className="space-y-4">
      {data && !data.ok && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {(data as { errorMessage?: string }).errorMessage ?? "Instructions are unavailable."}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guidance, not enforcement</CardTitle>
          <CardDescription>
            Instructions tell agents how your organization prefers work to be done — tone,
            terminology, escalation etiquette, what to lead with. They are composed into an agent's
            context <strong>after</strong> guardrails have already decided what it may do, so they
            can never grant a permission or soften a control.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search instructions"
          className="max-w-md"
          aria-label="Search instructions"
        />
        {canManage && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setIssues([]);
              setEditorOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> New instruction
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <InstructionGroup
            title="Organization-wide"
            description="Applied to every agent, capability and connector in this workspace."
            items={orgWide}
            canManage={canManage}
            onEdit={(i) => {
              setEditing(i);
              setIssues([]);
              setEditorOpen(true);
            }}
            onToggle={(i) => toggleMutation.mutate({ id: i.id, enabled: !i.enabled })}
            onDelete={(i) => deleteMutation.mutate(i.id)}
            onHistory={setHistoryFor}
          />
          <InstructionGroup
            title="Targeted"
            description="Applied only to a specific agent, connector or capability."
            items={targeted}
            canManage={canManage}
            onEdit={(i) => {
              setEditing(i);
              setIssues([]);
              setEditorOpen(true);
            }}
            onToggle={(i) => toggleMutation.mutate({ id: i.id, enabled: !i.enabled })}
            onDelete={(i) => deleteMutation.mutate(i.id)}
            onHistory={setHistoryFor}
          />
          <GuidancePreview />
        </>
      )}

      <InstructionEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        saving={saveMutation.isPending}
        issues={issues}
        onSubmit={(draft) => saveMutation.mutate(draft)}
      />

      <InstructionHistoryDialog instruction={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

function InstructionGroup({
  title,
  description,
  items,
  canManage,
  onEdit,
  onToggle,
  onDelete,
  onHistory,
}: {
  title: string;
  description: string;
  items: InstructionRecord[];
  canManage: boolean;
  onEdit: (i: InstructionRecord) => void;
  onToggle: (i: InstructionRecord) => void;
  onDelete: (i: InstructionRecord) => void;
  onHistory: (i: InstructionRecord) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-muted-foreground" /> {title}
          <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "Nothing here yet. Add guidance to shape how agents communicate and prioritise."
              : "Nothing to show."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{i.name}</span>
                      <span className="text-[11px] text-muted-foreground">v{i.version}</span>
                      {!i.enabled && (
                        <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          Inactive
                        </span>
                      )}
                    </div>
                    {i.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{i.description}</p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                      {i.instructionText}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Pill>
                        {INSTRUCTION_SCOPE_LABELS[i.scope as InstructionScope] ?? i.scope}
                        {i.scopeId ? `: ${i.scopeId}` : ""}
                      </Pill>
                      <Pill>
                        {INSTRUCTION_CATEGORY_LABELS[i.category as InstructionCategory] ??
                          i.category}
                      </Pill>
                      <Pill>order {i.priority}</Pill>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onHistory(i)}>
                      History
                    </Button>
                    {canManage && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => onEdit(i)}>
                          Edit
                        </Button>
                        <Switch
                          checked={i.enabled}
                          onCheckedChange={() => onToggle(i)}
                          aria-label={`${i.enabled ? "Deactivate" : "Activate"} ${i.name}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${i.name}`}
                          onClick={() => onDelete(i)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

/** Shows exactly what an agent would receive for a described operation. */
function GuidancePreview() {
  const preview = useServerFn(previewInstructionGuidance);
  const [form, setForm] = useState({ agentKey: "", provider: "", capability: "" });
  const run = useMutation({ mutationFn: () => preview({ data: form }) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preview composed guidance</CardTitle>
        <CardDescription>
          See the exact advisory text an agent would receive for an operation. Nothing is executed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="prev-agent">Agent</Label>
            <Input
              id="prev-agent"
              value={form.agentKey}
              onChange={(e) => setForm((f) => ({ ...f, agentKey: e.target.value }))}
              placeholder="agent-license"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prev-provider">Connector</Label>
            <Input
              id="prev-provider"
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              placeholder="genesys"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prev-cap">Capability</Label>
            <Input
              id="prev-cap"
              value={form.capability}
              onChange={(e) => setForm((f) => ({ ...f, capability: e.target.value }))}
              placeholder="license_inventory"
            />
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Preview guidance
        </Button>
        {run.data &&
          (run.data.text ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs">
              {run.data.text}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              No instructions apply to that operation.
            </p>
          ))}
      </CardContent>
    </Card>
  );
}

function InstructionHistoryDialog({
  instruction,
  onClose,
}: {
  instruction: InstructionRecord | null;
  onClose: () => void;
}) {
  const fetchHistory = useServerFn(getOrganizationInstructionHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["instruction-history", instruction?.id],
    queryFn: () => fetchHistory({ data: { id: instruction!.id } }),
    enabled: Boolean(instruction),
  });

  return (
    <Dialog open={Boolean(instruction)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Every change to {instruction?.name ?? "this instruction"} is recorded immutably, so past
            agent behaviour can be explained with the guidance that was in force.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (data?.revisions ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No revisions recorded.</p>
        ) : (
          <ul className="space-y-3">
            {(data?.revisions ?? []).map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    v{r.version} — {r.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {r.instructionText}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Pill>
                    {r.scope}
                    {r.scopeId ? `: ${r.scopeId}` : ""}
                  </Pill>
                  <Pill>{r.category}</Pill>
                  <Pill>{r.enabled ? "active" : "inactive"}</Pill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
