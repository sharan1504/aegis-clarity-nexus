import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  History,
  Info,
  Layers,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, SeverityBadge, StatusPill } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useRole } from "@/lib/rbac";
import { useRealtime } from "@/lib/realtime";
import { useTenantContext } from "@/lib/tenant";
import { createExternalTicket, decideChange, initiateRollback } from "@/lib/change-service";
import {
  CHANGE_STAGES,
  stageIndex,
  type ChangeApproval,
  type ChangeStage,
} from "@/lib/change-data";
import { RiskChip, ModeChip } from "./_app.approvals.index";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/approvals/$id")({
  head: () => pageHead({ path: "/approvals", title: "Change Record Detail — Aegis AI", description: "Inspect AI reasoning, risk factors, approvals, rollback plans, validation, and immutable audit history for a single change record." }),
  component: ChangeDetailPage,
});

function ChangeDetailPage() {
  const { id } = useParams({ from: "/_app/approvals/$id" });
  const { role, can } = useRole();
  const { records, loading } = useRealtime();
  const { tenantId, user } = useTenantContext();
  const record = useMemo(() => records.find((c) => c.id === id) ?? null, [records, id]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const ctx = {
    tenantId: tenantId ?? "",
    actor: user?.email ?? "unknown",
    role,
  };

  if (!record && loading) {
    return <PageHeader title="Loading change record…" description={`Fetching ${id} from your workspace.`} />;
  }

  if (!record) {
    return (
      <div>
        <PageHeader title="Change record not found" description={`No record matches ID ${id}.`} />
        <Button asChild variant="outline">
          <Link to="/approvals" search={{ stage: "all", risk: "all", mode: "all", team: "all", q: "", sort: "id", dir: "asc" }}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Change Control Center
          </Link>
        </Button>
      </div>
    );
  }

  const currentStageIdx = stageIndex(record.stage);

  const guard = () => {
    if (tenantId) return true;
    toast.error("Workspace not ready", { description: "Try again in a moment." });
    return false;
  };

  const decide = async (action: "approved" | "rejected") => {
    if (!guard()) return;
    setBusy(true);
    try {
      await decideChange(record, action, ctx, comment || undefined);
      setComment("");
      if (action === "approved")
        toast.success("Approval recorded", { description: `${record.id} · signed as ${role} · audit entry written` });
      else toast.error("Rejection recorded", { description: `${record.id} · signed as ${role} · audit entry written` });
    } catch (err) {
      toast.error("Could not record decision", {
        description: err instanceof Error ? err.message : "Please retry.",
      });
    } finally {
      setBusy(false);
    }
  };

  const rollback = async () => {
    if (!guard()) return;
    setBusy(true);
    try {
      await initiateRollback(record, ctx);
      toast.success("Rollback initiated", {
        description: `${record.rollbackSteps.length} documented step(s) queued · audited`,
      });
    } catch (err) {
      toast.error("Could not initiate rollback", {
        description: err instanceof Error ? err.message : "Please retry.",
      });
    } finally {
      setBusy(false);
    }
  };

  const newTicket = async (system: "Jira" | "ServiceNow") => {
    if (!guard()) return;
    setBusy(true);
    try {
      const ticket = await createExternalTicket(record, system, ctx);
      toast.success(`${system} ticket created`, { description: `${ticket.id} linked to ${record.id}` });
    } catch (err) {
      toast.error("Could not create ticket", {
        description: err instanceof Error ? err.message : "Please retry.",
      });
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/approvals" search={{ stage: "all", risk: "all", mode: "all", team: "all", q: "", sort: "id", dir: "asc" }}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Change Control Center
          </Link>
        </Button>
        <span>/</span>
        <span className="font-mono text-foreground/80">{record.id}</span>
      </div>

      {/* Header */}
      <Card className="mb-4">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground/80">
                  {record.id}
                </span>
                <SeverityBadge severity={record.severity} />
                <StatusPill tone="info">{record.stage}</StatusPill>
                <span className="text-xs text-muted-foreground">
                  Created {record.createdAt}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">{record.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Proposed by {record.agent} · Owner: <span className="text-foreground">{record.ownerTeam}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Execution</div>
                  <div className="mt-1"><ModeChip mode={record.executionMode} /></div>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Risk score</div>
                  <div className="mt-1"><RiskChip tier={record.risk.tier} score={record.risk.score} /></div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  toast.success("Link copied", { description: "Share this change record with your team." });
                }}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Copy deep link
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Stepper current={currentStageIdx} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Business impact */}
          <Section icon={Info} title="Business impact">
            <p className="text-sm text-foreground/90">{record.businessImpact}</p>
          </Section>

          {/* AI reasoning */}
          <Section icon={FileText} title="AI reasoning" subtitle="Evidence gathered by the agent, verbatim">
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{record.aiReasoning}</p>
          </Section>

          {/* Risk factors */}
          <Section
            icon={ShieldAlert}
            title="Risk assessment"
            subtitle={`${record.risk.tier} risk — score ${record.risk.score}/100`}
          >
            <ul className="space-y-1.5 text-sm">
              {record.risk.factors.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-foreground/90">{f}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Approvals */}
          <Section icon={ShieldCheck} title="Required approvals" subtitle={`${record.approvals.filter((a) => a.status === "approved").length} of ${record.approvals.length} approved`}>
            <div className="space-y-2">
              {record.approvals.map((a, i) => (
                <ApprovalRow
                  key={a.rowId ?? i}
                  a={a}
                  disabled={busy || !can("approvals.approve")}
                  onApprove={() => void decide("approved")}
                  onReject={() => void decide("rejected")}
                />
              ))}
            </div>
            <Separator className="my-4" />
            <div>
              <label className="text-xs font-medium text-muted-foreground">Add comment (all approvals)</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional comment attached to your decision…"
                rows={2}
                className="mt-1 text-sm"
              />
            </div>
          </Section>

          {/* Rollback */}
          <Section
            icon={RotateCcw}
            title="Rollback plan"
            subtitle="Specific steps to reverse this exact change"
            action={
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !can("approvals.approve")}
                onClick={() => void rollback()}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Initiate rollback
              </Button>
            }
          >
            <ol className="space-y-2 text-sm">
              {record.rollbackSteps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted font-mono text-[10px]">
                    {i + 1}
                  </span>
                  <span className="text-foreground/90">{s}</span>
                </li>
              ))}
            </ol>
          </Section>

          {/* Timeline */}
          <Section icon={History} title="Timeline" subtitle="Chronological activity feed">
            <ul className="space-y-3">
              {record.timeline.map((e, i) => (
                <li key={i} className="grid grid-cols-[130px_1fr] gap-3 text-xs">
                  <span className="font-mono text-muted-foreground">{e.ts}</span>
                  <div>
                    <span className="font-medium text-foreground">{e.actor}</span>{" "}
                    <span className="text-foreground/80">{e.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="space-y-4">
          {/* Change window */}
          <SidePanel icon={Clock} title="Change window">
            <div className="space-y-1 font-mono text-xs">
              <div className="text-muted-foreground">Start</div>
              <div className="text-foreground">{record.window.start}</div>
              <div className="mt-2 text-muted-foreground">End</div>
              <div className="text-foreground">{record.window.end}</div>
            </div>
            <div className="mt-3">
              {record.window.inMaintenance ? (
                <StatusPill tone="success" icon={CheckCircle2}>
                  Inside maintenance window
                </StatusPill>
              ) : (
                <StatusPill tone="warning" icon={ShieldAlert}>
                  Outside standard window
                </StatusPill>
              )}
            </div>
          </SidePanel>

          {/* Team ownership */}
          <SidePanel icon={Layers} title="Team ownership">
            <div className="text-xs">
              <div className="text-muted-foreground">Owner (execution & accountability)</div>
              <div className="mt-0.5 text-sm font-medium text-foreground">{record.ownerTeam}</div>
              <div className="mt-3 text-muted-foreground">Requester</div>
              <div className="mt-0.5 text-sm text-foreground">{record.requester}</div>
            </div>
          </SidePanel>

          {/* Validations */}
          <SidePanel icon={CheckCircle2} title="Validation status">
            <ul className="space-y-2">
              {record.validations.map((v) => (
                <li key={v.name} className="text-xs">
                  <div className="flex items-center gap-2">
                    <StatusPill
                      tone={v.status === "passed" ? "success" : v.status === "warning" ? "warning" : "danger"}
                    >
                      {v.status}
                    </StatusPill>
                    <span className="font-medium text-foreground">{v.name}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{v.detail}</p>
                </li>
              ))}
            </ul>
          </SidePanel>

          {/* External tickets */}
          <SidePanel icon={ExternalLink} title="External tickets">
            <ul className="space-y-1.5">
              {record.externalTickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.system}</span>
                  <a
                    href={t.url}
                    className="font-mono text-xs text-primary hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      toast("Would open in " + t.system, { description: t.id });
                    }}
                  >
                    {t.id} ↗
                  </a>
                </li>
              ))}
              {record.externalTickets.length === 0 && (
                <li className="text-xs text-muted-foreground">No external tickets linked yet.</li>
              )}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                disabled={busy || !can("approvals.approve")}
                onClick={() => void newTicket("Jira")}
              >
                + Jira
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                disabled={busy || !can("approvals.approve")}
                onClick={() => void newTicket("ServiceNow")}
              >
                + ServiceNow
              </Button>
            </div>
          </SidePanel>

          {/* Audit history */}
          <SidePanel icon={History} title="Audit history" subtitle="Immutable compliance log">
            <ul className="space-y-2 font-mono text-[11px]">
              {record.audit.map((a, i) => (
                <li key={i} className="border-l-2 border-border pl-2.5">
                  <div className="text-muted-foreground">{a.ts}</div>
                  <div className="text-foreground/90">
                    <span className="text-primary">{a.actor}</span> {a.action}
                  </div>
                  <div className="text-muted-foreground/70">hash: {a.hash}</div>
                </li>
              ))}
            </ul>
          </SidePanel>
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {CHANGE_STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                done
                  ? "border-success/40 bg-success/10 text-success"
                  : active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : active ? <Circle className="h-3 w-3 fill-current" /> : <Circle className="h-3 w-3" />}
              <span>{s}</span>
            </div>
            {i < CHANGE_STAGES.length - 1 && (
              <span className={`h-px w-4 ${done ? "bg-success/50" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon className="h-4 w-4 text-primary" /> {title}
            </CardTitle>
            {subtitle && <CardDescription className="text-xs">{subtitle}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SidePanel({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {title}
        </CardTitle>
        {subtitle && <CardDescription className="text-[11px]">{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-1">{children}</CardContent>
    </Card>
  );
}

function ApprovalRow({
  a,
  disabled,
  onApprove,
  onReject,
}: {
  a: ChangeApproval;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const toneMap = { approved: "success", rejected: "danger", pending: "warning" } as const;
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.team}</div>
          <div className="mt-0.5 text-sm font-medium">
            {a.approver} <span className="text-xs font-normal text-muted-foreground">· {a.role}</span>
          </div>
          {a.comment && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="italic">"{a.comment}"</span>
            </div>
          )}
          {a.timestamp && (
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">{a.timestamp}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={toneMap[a.status]}>{a.status}</StatusPill>
          {a.status === "pending" && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={disabled} onClick={onReject}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" disabled={disabled} onClick={onApprove}>
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
