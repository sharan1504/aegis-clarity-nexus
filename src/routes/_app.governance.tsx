import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/AppLayout";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DecisionPill,
  EffectPill,
  ModePill,
  ScopePill,
  SeverityPill,
} from "@/components/guardrails/GuardrailPills";
import { GuardrailEditor, type GuardrailDraft } from "@/components/guardrails/GuardrailEditor";
import { GuardrailSimulator } from "@/components/guardrails/GuardrailSimulator";
import {
  deleteGuardrail,
  getGuardrailHistory,
  listGuardrails,
  saveGuardrail,
  setGuardrailEnabled,
} from "@/lib/guardrails.functions";
import {
  GUARDRAIL_TYPE_LABELS,
  describeGuardrail,
  type GuardrailRecord,
  type GuardrailType,
} from "@/lib/guardrails/types";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/governance")({
  head: () =>
    pageHead({
      path: "/governance",
      title: "Guardrails & Governance — Aegis AI",
      description:
        "Author, simulate, and audit the platform guardrails that constrain every Aegis AI agent, capability, connector, and tool.",
    }),
  component: GovernancePage,
});

function GovernancePage() {
  const queryClient = useQueryClient();
  const fetchAll = useServerFn(listGuardrails);
  const save = useServerFn(saveGuardrail);
  const toggle = useServerFn(setGuardrailEnabled);
  const remove = useServerFn(deleteGuardrail);

  const queryKey = ["guardrails"];
  const { data, isLoading } = useQuery({ queryKey, queryFn: () => fetchAll({}) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const canManage = data?.canManage ?? false;
  const guardrails = (data?.guardrails ?? []) as GuardrailRecord[];
  const evaluations = data?.evaluations ?? [];

  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<GuardrailRecord | null>(null);
  const [issues, setIssues] = useState<Array<{ field: string; message: string }>>([]);
  const [historyFor, setHistoryFor] = useState<GuardrailRecord | null>(null);

  const saveMutation = useMutation({
    mutationFn: (draft: GuardrailDraft) => save({ data: draft as unknown as Record<string, unknown> }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Guardrail saved");
        setEditorOpen(false);
        setIssues([]);
        void invalidate();
      } else {
        const payload = res as { errorMessage?: string; issues?: Array<{ field: string; message: string }> };
        setIssues(payload.issues ?? []);
        toast.error(payload.errorMessage ?? "The guardrail could not be saved.");
      }
    },
    onError: () => toast.error("The guardrail could not be saved."),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) => toggle({ data: vars }),
    onSuccess: (res) => {
      if (res.ok) void invalidate();
      else toast.error((res as { errorMessage?: string }).errorMessage ?? "Update failed.");
    },
    onError: () => toast.error("The guardrail could not be updated."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Guardrail deleted");
        void invalidate();
      } else toast.error((res as { errorMessage?: string }).errorMessage ?? "Delete failed.");
    },
    onError: () => toast.error("The guardrail could not be deleted."),
  });

  const term = search.trim().toLowerCase();
  const filtered = term
    ? guardrails.filter((g) =>
        [g.name, g.description ?? "", g.scope, g.scopeId ?? "", g.guardrailType]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : guardrails;

  const platform = filtered.filter((g) => g.isSystem);
  const tenant = filtered.filter((g) => !g.isSystem);

  return (
    <div>
      <PageHeader
        title="Guardrails & Governance"
        description="Mandatory, server-enforced controls. No agent, prompt, tool, connector, or workflow can bypass them."
        actions={
          canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setIssues([]);
                setEditorOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> New guardrail
            </Button>
          ) : undefined
        }
      />

      {data && !data.ok && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {(data as { errorMessage?: string }).errorMessage ?? "Governance data is unavailable."}
        </div>
      )}

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Guardrails</TabsTrigger>
          <TabsTrigger value="simulator">Simulator</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4 space-y-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guardrails by name, scope, or type"
            className="max-w-md"
            aria-label="Search guardrails"
          />

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <>
              <GuardrailGroup
                title="Platform baseline"
                description="Managed by Aegis. Always evaluated first and cannot be edited or removed."
                items={platform}
                canManage={false}
                onEdit={() => {}}
                onToggle={() => {}}
                onDelete={() => {}}
                onHistory={setHistoryFor}
              />
              <GuardrailGroup
                title="Organization guardrails"
                description="Authored by your administrators. Never weaken a platform baseline control."
                items={tenant}
                canManage={canManage}
                onEdit={(g) => {
                  setEditing(g);
                  setIssues([]);
                  setEditorOpen(true);
                }}
                onToggle={(g) => toggleMutation.mutate({ id: g.id, enabled: !g.enabled })}
                onDelete={(g) => deleteMutation.mutate(g.id)}
                onHistory={setHistoryFor}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="simulator" className="mt-4">
          <GuardrailSimulator />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent guardrail evaluations</CardTitle>
              <CardDescription>
                Every protected operation records its verdict, including monitor-mode matches and
                simulations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {evaluations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No evaluations recorded yet. Guardrails are evaluated whenever an agent reads a
                  data source or a tool is invoked.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {evaluations.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 py-3">
                      <DecisionPill decision={e.decision} />
                      <span className="text-sm font-medium">
                        {e.capability ?? e.actionKey ?? "operation"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {[e.agentKey, e.provider, e.environment, e.executionClass]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {e.simulated && (
                        <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          simulated
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                      {e.reasons.length > 0 && (
                        <p className="w-full text-xs text-muted-foreground">
                          {e.reasons.join(" · ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <GuardrailEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        saving={saveMutation.isPending}
        issues={issues}
        onSubmit={(draft) => saveMutation.mutate(draft)}
      />

      <HistoryDialog guardrail={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

function GuardrailGroup({
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
  items: GuardrailRecord[];
  canManage: boolean;
  onEdit: (g: GuardrailRecord) => void;
  onToggle: (g: GuardrailRecord) => void;
  onDelete: (g: GuardrailRecord) => void;
  onHistory: (g: GuardrailRecord) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" /> {title}
          <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "No guardrails yet. Create one to constrain agents, capabilities, or tools."
              : "Nothing to show."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((g) => (
              <li key={g.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{g.name}</span>
                      <span className="text-[11px] text-muted-foreground">v{g.version}</span>
                      {!g.enabled && (
                        <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {g.description ?? describeGuardrail(g)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <ScopePill scope={g.scope} scopeId={g.scopeId} />
                      <SeverityPill severity={g.severity} />
                      <EffectPill effect={g.action.effect} />
                      <ModePill mode={g.enforcementMode} />
                      <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {GUARDRAIL_TYPE_LABELS[g.guardrailType as GuardrailType] ?? g.guardrailType}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onHistory(g)}>
                      History
                    </Button>
                    {canManage && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => onEdit(g)}>
                          Edit
                        </Button>
                        <Switch
                          checked={g.enabled}
                          onCheckedChange={() => onToggle(g)}
                          aria-label={`${g.enabled ? "Disable" : "Enable"} ${g.name}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${g.name}`}
                          onClick={() => onDelete(g)}
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

function HistoryDialog({
  guardrail,
  onClose,
}: {
  guardrail: GuardrailRecord | null;
  onClose: () => void;
}) {
  const fetchHistory = useServerFn(getGuardrailHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["guardrail-history", guardrail?.id],
    queryFn: () => fetchHistory({ data: { id: guardrail!.id } }),
    enabled: Boolean(guardrail),
  });

  return (
    <Dialog open={Boolean(guardrail)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Every change to {guardrail?.name ?? "this guardrail"} is recorded immutably so a past
            decision can be explained with the rule that was in force.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (data?.revisions ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No revisions recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(data?.revisions ?? []).map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    v{r.version} · {r.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {describeGuardrail({
                    scope: r.scope as GuardrailRecord["scope"],
                    scopeId: r.scopeId,
                    conditions: r.conditions,
                    action: r.action,
                  })}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <SeverityPill severity={r.severity as GuardrailRecord["severity"]} />
                  <EffectPill effect={r.action.effect} />
                  <ModePill mode={r.enforcementMode as GuardrailRecord["enforcementMode"]} />
                  {!r.enabled && (
                    <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Disabled
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
