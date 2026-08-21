import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  History,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, SeverityBadge, StatusPill } from "@/components/layout/AppLayout";
import { useRole } from "@/lib/rbac";
import { auditRepository } from "@/lib/audit/repository";
import { ACTION_LABELS, RESOURCE_LABELS, type AuditAction, type AuditEvent, type AuditFilters, type AuditResourceType, type AuditResult, type AuditRisk } from "@/lib/audit/types";

export const Route = createFileRoute("/_app/audit")({ component: AuditViewerPage });

const all = "all";

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function AuditViewerPage() {
  const { role } = useRole();
  const [filters, setFilters] = useState<AuditFilters>({ range: "30d", actorId: all, action: all, resourceType: all, integration: all, agent: all, result: all, risk: all, role: all, approvalStatus: all });
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [stats, setStats] = useState({ total: 0, today: 0, highRisk: 0, failed: 0 });
  const [loading, setLoading] = useState(false);
  const canExport = role === "Admin" || role === "Manager" || role === "Analyst";

  const load = async () => {
    setLoading(true);
    try {
      const [rows, summary] = await Promise.all([
        auditRepository.list(filters, { canSeeSensitiveMetadata: role === "Admin" }),
        auditRepository.stats(filters, { canSeeSensitiveMetadata: role === "Admin" }),
      ]);
      setEvents(rows);
      setStats(summary);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [filters, role]);

  const actors = useMemo(() => [...new Map(events.map((e) => [e.actor.id, e.actor])).values()], [events]);
  const integrations = useMemo(() => [...new Set(events.map((e) => e.integration).filter(Boolean))] as string[], [events]);
  const agents = useMemo(() => [...new Set(events.map((e) => e.agent).filter(Boolean))] as string[], [events]);

  const update = (patch: Partial<AuditFilters>) => setFilters((current) => ({ ...current, ...patch }));

  const exportCsv = async () => {
    if (!canExport) return;
    const rows = await auditRepository.list(filters, { canSeeSensitiveMetadata: role === "Admin" });
    const header = ["Timestamp", "Actor", "Role", "Action", "Resource", "Integration", "Agent", "Result", "Risk", "Approval", "Event ID", "Correlation ID"];
    const csv = [header, ...rows.map((e) => [e.timestamp, e.actor.email, e.actor.role, ACTION_LABELS[e.action], e.resourceName, e.integration ?? "", e.agent ?? "", e.result, e.risk, e.approvalId ?? "", e.id, e.correlationId])]
      .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `aegis-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Viewer"
        description="A complete, traceable record of identity, integrations, agents, approvals, changes, and security activity."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
            <Button onClick={() => void exportCsv()} disabled={!canExport}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Total events" value={stats.total} icon={History} />
        <Metric title="Events today" value={stats.today} icon={Activity} />
        <Metric title="High / critical" value={stats.highRisk} icon={ShieldAlert} danger={stats.highRisk > 0} />
        <Metric title="Failed events" value={stats.failed} icon={XCircle} danger={stats.failed > 0} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search actor, action, resource, event ID…" value={filters.search ?? ""} onChange={(e) => update({ search: e.target.value || undefined })} />
            </div>
            <Select value={filters.range ?? "30d"} onValueChange={(value) => update({ range: value as AuditFilters["range"] })}>
              <SelectTrigger className="w-[135px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="30d">Last 30 days</SelectItem></SelectContent>
            </Select>
            <Select value={filters.actorId ?? all} onValueChange={(value) => update({ actorId: value })}>
              <SelectTrigger className="w-[155px]"><SelectValue placeholder="Actor" /></SelectTrigger>
              <SelectContent><SelectItem value={all}>All actors</SelectItem>{actors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filters.action ?? all} onValueChange={(value) => update({ action: value as AuditAction | "all" })}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent><SelectItem value={all}>All actions</SelectItem>{Object.entries(ACTION_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filters.resourceType ?? all} onValueChange={(value) => update({ resourceType: value as AuditResourceType | "all" })}>
              <SelectTrigger className="w-[155px]"><SelectValue placeholder="Resource" /></SelectTrigger>
              <SelectContent><SelectItem value={all}>All resources</SelectItem>{Object.entries(RESOURCE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filters.result ?? all} onValueChange={(value) => update({ result: value as AuditResult | "all" })}>
              <SelectTrigger className="w-[125px]"><SelectValue placeholder="Result" /></SelectTrigger>
              <SelectContent><SelectItem value={all}>All results</SelectItem><SelectItem value="success">Success</SelectItem><SelectItem value="warning">Warning</SelectItem><SelectItem value="failure">Failure</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent>
            </Select>
            <Select value={filters.risk ?? all} onValueChange={(value) => update({ risk: value as AuditRisk | "all" })}>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="Risk" /></SelectTrigger>
              <SelectContent><SelectItem value={all}>All risk</SelectItem><SelectItem value="critical">Critical</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="info">Info</SelectItem></SelectContent>
            </Select>
            <Badge variant="outline" className="gap-1"><Filter className="h-3 w-3" />{events.length} matching</Badge>
          </div>
          {(integrations.length > 0 || agents.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {integrations.length > 0 && <Select value={filters.integration ?? all} onValueChange={(value) => update({ integration: value })}><SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Integration" /></SelectTrigger><SelectContent><SelectItem value={all}>All integrations</SelectItem>{integrations.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>}
              {agents.length > 0 && <Select value={filters.agent ?? all} onValueChange={(value) => update({ agent: value })}><SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Agent" /></SelectTrigger><SelectContent><SelectItem value={all}>All agents</SelectItem>{agents.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="table">
        <div className="flex items-center justify-between">
          <TabsList><TabsTrigger value="table">Table</TabsTrigger><TabsTrigger value="timeline">Timeline</TabsTrigger></TabsList>
          <span className="text-xs text-muted-foreground">Seeded records are marked as demo data until real emitters are connected.</span>
        </div>
        <TabsContent value="table" className="mt-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left font-medium">Time</th><th className="px-4 py-3 text-left font-medium">Actor</th><th className="px-4 py-3 text-left font-medium">Action</th><th className="px-4 py-3 text-left font-medium">Resource</th><th className="px-4 py-3 text-left font-medium">Source</th><th className="px-4 py-3 text-left font-medium">Result</th><th className="px-4 py-3 text-left font-medium">Risk</th><th className="px-4 py-3 text-right font-medium">Event ID</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {events.map((event) => <tr key={event.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelected(event)}>
                    <td className="whitespace-nowrap px-4 py-3"><div>{relativeTime(event.timestamp)}</div><div className="text-[11px] text-muted-foreground">{formatTime(event.timestamp)}</div></td>
                    <td className="px-4 py-3"><div className="font-medium">{event.actor.name}</div><div className="text-xs text-muted-foreground">{event.actor.role}</div></td>
                    <td className="px-4 py-3"><div className="font-medium">{ACTION_LABELS[event.action]}</div>{event.approvalId && <div className="text-xs text-muted-foreground">Approval {event.approvalId}</div>}</td>
                    <td className="px-4 py-3"><div>{event.resourceName}</div><div className="text-xs text-muted-foreground">{RESOURCE_LABELS[event.resourceType]}</div></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{event.integration ?? event.agent ?? event.source.channel}</td>
                    <td className="px-4 py-3">{event.result === "success" ? <StatusPill tone="success" icon={CheckCircle2}>Success</StatusPill> : event.result === "failure" ? <StatusPill tone="danger" icon={XCircle}>Failed</StatusPill> : <StatusPill tone="warning" icon={AlertTriangle}>{event.result}</StatusPill>}</td>
                    <td className="px-4 py-3"><SeverityBadge severity={event.risk} /></td>
                    <td className="px-4 py-3 text-right font-mono text-[10px] text-muted-foreground">{event.id}</td>
                  </tr>)}
                  {events.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No audit events match the selected filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <Card><CardContent className="pt-6"><div className="space-y-6">{events.map((event, index) => <div key={event.id} className="relative flex gap-4"><div className="flex w-5 shrink-0 justify-center"><div className="z-10 mt-1 h-3 w-3 rounded-full border-2 border-primary bg-background" />{index < events.length - 1 && <div className="absolute top-4 h-full w-px bg-border" />}</div><button className="flex-1 rounded-lg border border-border p-4 text-left hover:bg-muted/30" onClick={() => setSelected(event)}><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{ACTION_LABELS[event.action]} <span className="font-normal text-muted-foreground">· {event.resourceName}</span></div><div className="mt-1 text-xs text-muted-foreground">{event.actor.name} · {formatTime(event.timestamp)} · {event.correlationId}</div></div><SeverityBadge severity={event.risk} /></div></button></div>)}</div></CardContent></Card>
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          {selected && <AuditDetail event={selected} onClose={() => setSelected(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Metric({ title, value, icon: Icon, danger }: { title: string; value: number; icon: React.ComponentType<{ className?: string }>; danger?: boolean }) {
  return <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs text-muted-foreground">{title}</p><p className={`mt-1 text-2xl font-semibold ${danger ? "text-destructive" : ""}`}>{value}</p></div><div className={`rounded-lg p-2.5 ${danger ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}><Icon className="h-5 w-5" /></div></CardContent></Card>;
}

function AuditDetail({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
  return <>
    <SheetHeader><SheetTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" />Audit event</SheetTitle></SheetHeader>
    <ScrollArea className="mt-6 h-[calc(100vh-100px)] pr-4">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={event.risk} />{event.result === "success" ? <StatusPill tone="success">Success</StatusPill> : <StatusPill tone={event.result === "failure" ? "danger" : "warning"}>{event.result}</StatusPill>}{event.seeded && <Badge variant="outline">Demo data</Badge>}</div>
        <div><h3 className="text-lg font-semibold">{ACTION_LABELS[event.action]}</h3><p className="mt-1 text-sm text-muted-foreground">{event.resourceName} · {RESOURCE_LABELS[event.resourceType]}</p></div>
        <Separator />
        <DetailGrid event={event} />
        {event.changes.length > 0 && <div><h4 className="mb-3 text-sm font-semibold">Before / after</h4><div className="space-y-2">{event.changes.map((change) => <div key={change.field} className="rounded-lg border p-3"><div className="text-xs font-medium">{change.field}</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="rounded bg-destructive/5 p-2"><div className="text-[10px] uppercase text-muted-foreground">Previous</div><div className="mt-1 break-words text-sm">{change.oldValue ?? "—"}</div></div><div className="rounded bg-success/5 p-2"><div className="text-[10px] uppercase text-muted-foreground">New</div><div className="mt-1 break-words text-sm">{change.newValue ?? "—"}</div></div></div></div>)}</div></div>}
        {event.reason && <div><h4 className="text-sm font-semibold">Reason / comment</h4><p className="mt-2 rounded-lg bg-muted/40 p-3 text-sm">{event.reason}</p></div>}
        {event.approvalId && <div><h4 className="text-sm font-semibold">Approval chain</h4><div className="mt-2 rounded-lg border p-3 text-sm"><div>Approval: <span className="font-mono">{event.approvalId}</span></div><div className="mt-1 text-muted-foreground">Status: {event.approvalStatus ?? "not_required"}</div></div></div>}
        <div><h4 className="text-sm font-semibold">Correlation</h4><p className="mt-2 rounded-lg bg-muted/40 p-3 font-mono text-xs break-all">{event.correlationId}</p></div>
        <div><h4 className="text-sm font-semibold">Metadata</h4><pre className="mt-2 overflow-auto rounded-lg bg-muted/40 p-3 text-xs">{JSON.stringify(event.metadata ?? {}, null, 2)}</pre></div>
        <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
      </div>
    </ScrollArea>
  </>;
}

function DetailGrid({ event }: { event: AuditEvent }) {
  const rows = [
    ["Event ID", event.id], ["Timestamp", formatTime(event.timestamp)], ["Actor", `${event.actor.name} (${event.actor.role})`], ["Actor email", event.actor.email], ["Target ID", event.targetId ?? "—"], ["Integration", event.integration ?? "—"], ["Agent", event.agent ?? "—"], ["Channel", event.source.channel], ["Source IP", event.source.ip ?? "—"], ["Device", event.source.device ?? "—"],
  ];
  return <div className="grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-lg border p-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm">{value}</div></div>)}</div>;
}
