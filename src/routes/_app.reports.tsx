import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, FileBarChart, FileJson, FileSpreadsheet, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyIntegrationsState } from "@/components/EmptyIntegrationsState";
import { useTenantContext } from "@/lib/tenant";
import { useRole } from "@/lib/rbac";
import { getLiveWorkspaceData, type LiveWorkspaceData } from "@/lib/live-workspace.functions";
import { DEFAULT_REPORT_PARAMS, generateReport, listReports, refreshReportLink, type ReportFormat, type ReportRow, type StoredReport } from "@/lib/reports-service";
import { getReportRetentionDays, purgeExpiredReports, setReportRetentionDays } from "@/lib/reports-retention.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/reports")({ head: () => pageHead({ path: "/reports", title: "Reports — Aegis AI", description: "Generate reports from live tenant telemetry with audited, signed exports." }), component: ReportsPage });

type Template = { id: string; title: string; description: string };
const templates: Template[] = [
  { id: "executive-snapshot", title: "Executive Snapshot", description: "Current connected-system health, users, licensing and operational signals." },
  { id: "license-optimization", title: "License Optimization", description: "Live Genesys licensing assignments, inactive licensed users and overlap signals." },
  { id: "contact-center-operations", title: "Contact Center Operations", description: "Live Genesys users, queues, activity and connection freshness." },
];

function rowsFor(template: Template, data: LiveWorkspaceData): ReportRow[] {
  const common = [{ metric: "Organization", value: data.orgName ?? "Genesys Cloud", detail: `${data.region ?? ""} · fetched ${data.fetchedAt}`, category: "Source" }, { metric: "Connection health", value: data.healthStatus ?? "unknown", detail: data.readOnly ? "Read-only connector" : "", category: "Source" }];
  if (template.id === "license-optimization") return [...common, { metric: "Users", value: String(data.users), detail: "Current Genesys user population", category: "License" }, { metric: "Licensed users", value: String(data.licensedUsers), detail: "Users with at least one license assignment", category: "License" }, { metric: "License assignments", value: String(data.licenseAssignments), detail: "Current user-license relationships", category: "License" }, { metric: "License types", value: String(data.licenseTypes), detail: "Current license definitions", category: "License" }, { metric: "Multiple-license users", value: String(data.multipleLicenseUsers), detail: "Users with more than one license", category: "Optimization" }, { metric: "90+ day inactive licensed users", value: String(data.inactiveLicensedUsers), detail: "Review signal; no automatic removal", category: "Optimization" }];
  if (template.id === "contact-center-operations") return [...common, { metric: "Users", value: String(data.users), detail: "Current Genesys users", category: "Operations" }, { metric: "Active users", value: String(data.activeUsers), detail: "Users currently marked active", category: "Operations" }, { metric: "Queues", value: String(data.queues), detail: "Current routing queues", category: "Operations" }, { metric: "Empty queues", value: String(data.emptyQueues), detail: "Queues with zero members", category: "Operations" }, { metric: "Persisted last sync", value: data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString() : "Not available", detail: "Last successful Aegis sync", category: "Freshness" }];
  return [...common, { metric: "Users", value: String(data.users), detail: "Current Genesys users", category: "Executive" }, { metric: "Active users", value: String(data.activeUsers), detail: "Users currently marked active", category: "Executive" }, { metric: "Licensed users", value: String(data.licensedUsers), detail: "Users with one or more license assignments", category: "Executive" }, { metric: "Queues", value: String(data.queues), detail: "Current routing queues", category: "Executive" }, { metric: "Live recommendations", value: String(data.recommendations.length), detail: "Evidence-backed signals currently available", category: "Executive" }];
}

function ReportsPage() {
  const { tenantId, tenantName } = useTenantContext();
  const { role } = useRole();
  const loadLive = useServerFn(getLiveWorkspaceData);
  const purge = useServerFn(purgeExpiredReports);
  const readRetention = useServerFn(getReportRetentionDays);
  const writeRetention = useServerFn(setReportRetentionDays);
  const [live, setLive] = useState<LiveWorkspaceData | null>(null);
  const [history, setHistory] = useState<StoredReport[]>([]);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [retention, setRetention] = useState("30");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const canExport = role === "Admin" || role === "Manager";

  const refresh = async () => { setLoading(true); try { const [l, h] = await Promise.all([loadLive(), tenantId ? listReports(tenantId) : Promise.resolve([])]); setLive(l); setHistory(h); const r = await readRetention({}); setRetention(String(r.retentionDays)); if (role === "Admin") await purge({}); } catch (e) { toast.error("Reports could not be loaded", { description: e instanceof Error ? e.message : "Try again." }); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, [tenantId]);

  const filteredHistory = useMemo(() => history.filter((h) => `${h.name} ${h.dataset}`.toLowerCase().includes(query.toLowerCase())), [history, query]);
  const exportReport = async (template: Template) => { if (!live || !tenantId) return; setBusy(`${template.id}:${format}`); try { const generated = await generateReport({ tenantId, tenantName: tenantName ?? "Workspace", dataset: template.id, name: template.title, format, rows: rowsFor(template, live), actorRole: role, params: DEFAULT_REPORT_PARAMS, retentionDays: Number(retention) }); window.open(generated.signedUrl, "_blank", "noopener,noreferrer"); toast.success(`${template.title} ready`, { description: "Generated from live connected telemetry." }); await refresh(); } catch (e) { toast.error("Report generation failed", { description: e instanceof Error ? e.message : "Try again." }); } finally { setBusy(null); } };
  const download = async (report: StoredReport) => { if (!tenantId || report.purgedAt) return; try { const url = await refreshReportLink(tenantId, report, role); window.open(url, "_blank", "noopener,noreferrer"); } catch (e) { toast.error("Download failed", { description: e instanceof Error ? e.message : "Try again." }); } };
  const saveRetention = async () => { try { await writeRetention({ data: { days: Number(retention) } }); toast.success("Report retention updated"); } catch (e) { toast.error("Could not update retention", { description: e instanceof Error ? e.message : "Try again." }); } };

  return <div><PageHeader title="Reports" description="Every report is generated from live tenant data, stored with retention controls, and delivered through an audited signed link." actions={<Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>} />
    {!live?.connected ? <EmptyIntegrationsState title="No live data available for reports" description="Connect Genesys or another supported provider. Aegis will not generate reports from seeded demo data." /> : <>
      <div className="mb-4 flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-success/40 text-success">Live source: {live.orgName ?? "Genesys Cloud"}</Badge><Badge variant="outline">Fetched {new Date(live.fetchedAt).toLocaleTimeString()}</Badge><div className="ml-auto flex items-center gap-2"><Select value={format} onValueChange={(v) => setFormat(v as ReportFormat)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pdf"><FileText className="mr-1.5 inline h-3.5 w-3.5" /> Print / PDF</SelectItem><SelectItem value="csv"><FileSpreadsheet className="mr-1.5 inline h-3.5 w-3.5" /> CSV</SelectItem><SelectItem value="json"><FileJson className="mr-1.5 inline h-3.5 w-3.5" /> JSON</SelectItem></SelectContent></Select></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.map((template) => <Card key={template.id}><CardHeader><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileBarChart className="h-5 w-5" /></div><CardTitle className="mt-3 text-base">{template.title}</CardTitle><CardDescription>{template.description}</CardDescription></CardHeader><CardContent><Button className="w-full" size="sm" disabled={!canExport || !!busy} onClick={() => void exportReport(template)}>{busy === `${template.id}:${format}` ? "Generating…" : `Generate ${format.toUpperCase()}`}</Button>{!canExport && <p className="mt-2 text-[11px] text-muted-foreground">Admin or Manager role required to export.</p>}</CardContent></Card>)}</div>
      <Card className="mt-6"><CardHeader><CardTitle className="text-base">Export history</CardTitle><CardDescription>Real stored exports for this workspace.</CardDescription></CardHeader><CardContent><div className="mb-3 flex gap-2"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports…" /><Input className="w-28" type="number" min="1" value={retention} onChange={(e) => setRetention(e.target.value)} /><Button variant="outline" onClick={() => void saveRetention()}>Retention</Button></div><div className="space-y-2">{filteredHistory.length ? filteredHistory.map((h) => <div key={h.id} className="flex items-center gap-3 rounded-lg border p-3"><FileBarChart className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{h.name}</div><div className="text-xs text-muted-foreground">{h.format.toUpperCase()} · {new Date(h.createdAt).toLocaleString()} · {h.sizeBytes.toLocaleString()} bytes</div></div><Button size="sm" variant="outline" disabled={!!h.purgedAt} onClick={() => void download(h)}><Download className="mr-1.5 h-4 w-4" /> {h.purgedAt ? "Purged" : "Download"}</Button></div>) : <div className="py-10 text-center text-sm text-muted-foreground">No reports generated yet.</div>}</div></CardContent></Card>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-success" /> Reports contain only live connected evidence and are tenant-scoped.</div>
    </>}
  </div>;
}
