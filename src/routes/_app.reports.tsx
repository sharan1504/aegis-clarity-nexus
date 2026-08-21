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
import { getReportWorkspaceData } from "@/lib/report-workspace.functions";
import { syncReportProvider } from "@/lib/provider-sync.functions";
import { DEFAULT_REPORT_PARAMS, generateReport, listReports, refreshReportLink, type ReportFormat, type ReportRow, type StoredReport } from "@/lib/reports-service";
import { getReportRetentionDays, purgeExpiredReports, setReportRetentionDays } from "@/lib/reports-retention.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/reports")({ head: () => pageHead({ path: "/reports", title: "Reports — Aegis AI", description: "Generate reports from live tenant telemetry with audited, signed exports." }), component: ReportsPage });
type Template = { id: string; title: string; description: string; requires?: string[] };
type WorkspaceData = Awaited<ReturnType<typeof getReportWorkspaceData>>;
const templates: Template[] = [
  { id: "executive-snapshot", title: "Executive Snapshot", description: "Current evidence from every connected and successfully synchronized provider." },
  { id: "license-optimization", title: "License Optimization", description: "Genesys licensing signals when Genesys is actually connected." , requires: ["genesys"]},
  { id: "contact-center-operations", title: "Contact Center Operations", description: "Genesys users, queues and activity when available." , requires: ["genesys"]},
  { id: "devops-health", title: "DevOps Health", description: "Real GitHub repository and Jira issue/project evidence from successful syncs.", requires: ["github", "jira"] },
];
function providerRows(data: WorkspaceData): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const connection of data.providers.connectedProviders) {
    const entities = data.providers.entities.filter((e: any) => e.provider === connection.provider);
    if (!entities.length) continue;
    rows.push({ metric: `${connection.display_name ?? connection.provider} synchronized records`, value: String(entities.length), detail: `Last observed ${new Date(entities.reduce((latest: string, e: any) => e.observed_at > latest ? e.observed_at : latest, entities[0].observed_at)).toLocaleString()}`, category: "Provider" });
    if (connection.provider === "github") {
      const repos = entities.filter((e: any) => e.entity_type === "repository");
      rows.push({ metric: "GitHub repositories", value: String(repos.length), detail: "Repositories returned by the connected GitHub account", category: "DevOps" });
      rows.push({ metric: "GitHub open issues", value: String(repos.reduce((sum: number, e: any) => sum + Number(e.payload?.openIssues ?? 0), 0)), detail: "Open issue counts from synchronized repositories", category: "DevOps" });
    }
    if (connection.provider === "jira") {
      rows.push({ metric: "Jira projects", value: String(entities.filter((e: any) => e.entity_type === "project").length), detail: "Projects returned by Jira", category: "ITSM" });
      rows.push({ metric: "Jira issues synchronized", value: String(entities.filter((e: any) => e.entity_type === "issue").length), detail: "Issues updated in the synchronized 30-day window", category: "ITSM" });
    }
    if (connection.provider === "slack") rows.push({ metric: "Slack channels", value: String(entities.filter((e: any) => e.entity_type === "channel").length), detail: "Non-archived channels returned by Slack", category: "Collaboration" });
  }
  return rows;
}
function rowsFor(template: Template, data: WorkspaceData): ReportRow[] {
  const genesys = data.genesys;
  const rows: ReportRow[] = [];
  if (template.id === "license-optimization" && genesys.connected) return [{ metric: "Organization", value: genesys.orgName ?? "Genesys Cloud", detail: `${genesys.region ?? ""} · fetched ${genesys.fetchedAt}`, category: "Source" }, { metric: "Users", value: String(genesys.users), detail: "Current Genesys user population", category: "License" }, { metric: "Licensed users", value: String(genesys.licensedUsers), detail: "Users with at least one license assignment", category: "License" }, { metric: "License assignments", value: String(genesys.licenseAssignments), detail: "Current user-license relationships", category: "License" }, { metric: "License types", value: String(genesys.licenseTypes), detail: "Current license definitions", category: "License" }, { metric: "Multiple-license users", value: String(genesys.multipleLicenseUsers), detail: "Users with more than one license", category: "Optimization" }, { metric: "90+ day inactive licensed users", value: String(genesys.inactiveLicensedUsers), detail: "Review signal; no automatic removal", category: "Optimization" }];
  if (template.id === "contact-center-operations" && genesys.connected) return [{ metric: "Organization", value: genesys.orgName ?? "Genesys Cloud", detail: `${genesys.region ?? ""} · fetched ${genesys.fetchedAt}`, category: "Source" }, { metric: "Users", value: String(genesys.users), detail: "Current Genesys users", category: "Operations" }, { metric: "Active users", value: String(genesys.activeUsers), detail: "Users currently marked active", category: "Operations" }, { metric: "Queues", value: String(genesys.queues), detail: "Current routing queues", category: "Operations" }, { metric: "Empty queues", value: String(genesys.emptyQueues), detail: "Queues with zero members", category: "Operations" }, { metric: "Persisted last sync", value: genesys.lastSyncAt ? new Date(genesys.lastSyncAt).toLocaleString() : "Not available", detail: "Last successful Aegis sync", category: "Freshness" }];
  if (template.id === "devops-health") return providerRows(data).filter((row) => row.category === "DevOps" || row.category === "ITSM");
  const common = providerRows(data);
  if (genesys.connected) common.unshift({ metric: "Genesys users", value: String(genesys.users), detail: "Live connected Genesys population", category: "Contact Center" }, { metric: "Genesys queues", value: String(genesys.queues), detail: "Live connected routing queues", category: "Contact Center" });
  return common;
}
function hasRealData(template: Template, data: WorkspaceData) {
  const rows = rowsFor(template, data);
  if (template.id === "license-optimization" || template.id === "contact-center-operations") return data.genesys.connected && rows.length > 0;
  return rows.length > 0;
}
function ReportsPage() {
  const { tenantId, tenantName } = useTenantContext(); const { role } = useRole();
  const load = useServerFn(getReportWorkspaceData); const sync = useServerFn(syncReportProvider);
  const purge = useServerFn(purgeExpiredReports); const readRetention = useServerFn(getReportRetentionDays); const writeRetention = useServerFn(setReportRetentionDays);
  const [data, setData] = useState<WorkspaceData | null>(null); const [history, setHistory] = useState<StoredReport[]>([]); const [format, setFormat] = useState<ReportFormat>("pdf"); const [retention, setRetention] = useState("30"); const [busy, setBusy] = useState<string | null>(null); const [query, setQuery] = useState(""); const [loading, setLoading] = useState(true); const canExport = role === "Admin" || role === "Manager";
  const refresh = async () => { setLoading(true); try { const [workspace, h, r] = await Promise.all([load(), tenantId ? listReports(tenantId) : Promise.resolve([]), readRetention({})]); setData(workspace); setHistory(h); setRetention(String(r.retentionDays)); if (role === "Admin") await purge({}); } catch (e) { toast.error("Reports could not be loaded", { description: e instanceof Error ? e.message : "Try again." }); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, [tenantId]);
  const filteredHistory = useMemo(() => history.filter((h) => `${h.name} ${h.dataset}`.toLowerCase().includes(query.toLowerCase())), [history, query]);
  const syncProvider = async (provider: "github" | "jira" | "slack") => { setBusy(`sync:${provider}`); try { await sync({ data: { provider } }); toast.success(`${provider} sync completed`); await refresh(); } catch (e) { toast.error(`${provider} sync failed`, { description: e instanceof Error ? e.message : "Try again." }); } finally { setBusy(null); } };
  const exportReport = async (template: Template) => { if (!data || !tenantId) return; const rows = rowsFor(template, data); if (!rows.length) return; setBusy(`${template.id}:${format}`); try { const generated = await generateReport({ tenantId, tenantName: tenantName ?? "Workspace", dataset: template.id, name: template.title, format, rows, actorRole: role, params: DEFAULT_REPORT_PARAMS, retentionDays: Number(retention) }); window.open(generated.signedUrl, "_blank", "noopener,noreferrer"); toast.success(`${template.title} ready`, { description: "Generated from real connected and synchronized evidence." }); await refresh(); } catch (e) { toast.error("Report generation failed", { description: e instanceof Error ? e.message : "Try again." }); } finally { setBusy(null); } };
  const download = async (report: StoredReport) => { if (!tenantId || report.purgedAt) return; try { const url = await refreshReportLink(tenantId, report, role); window.open(url, "_blank", "noopener,noreferrer"); } catch (e) { toast.error("Download failed", { description: e instanceof Error ? e.message : "Try again." }); } };
  const saveRetention = async () => { try { await writeRetention({ data: { days: Number(retention) } }); toast.success("Report retention updated"); } catch (e) { toast.error("Could not update retention", { description: e instanceof Error ? e.message : "Try again." }); } };
  return <div><PageHeader title="Reports" description="Reports are generated only from real connected and successfully synchronized tenant evidence." actions={<Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>} />
    {!data || (!data.genesys.connected && data.providers.connectedProviders.length === 0) ? <EmptyIntegrationsState title="No live data available for reports" description="Connect a supported provider and run a successful sync. Aegis will not generate reports from seeded demo data." /> : <>
      <div className="mb-4 flex flex-wrap items-center gap-2">{data.providers.connectedProviders.map((c: any) => <Badge key={c.provider} variant="outline" className="border-success/40 text-success">Live: {c.display_name ?? c.provider}</Badge>)}{data.genesys.connected && <Badge variant="outline" className="border-success/40 text-success">Live: Genesys Cloud</Badge>}<div className="ml-auto flex items-center gap-2"><Select value={format} onValueChange={(v) => setFormat(v as ReportFormat)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pdf"><FileText className="mr-1.5 inline h-3.5 w-3.5" /> Print / PDF</SelectItem><SelectItem value="csv"><FileSpreadsheet className="mr-1.5 inline h-3.5 w-3.5" /> CSV</SelectItem><SelectItem value="json"><FileJson className="mr-1.5 inline h-3.5 w-3.5" /> JSON</SelectItem></SelectContent></Select></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{templates.map((template) => { const available = hasRealData(template, data); return <Card key={template.id}><CardHeader><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileBarChart className="h-5 w-5" /></div><CardTitle className="mt-3 text-base">{template.title}</CardTitle><CardDescription>{template.description}</CardDescription></CardHeader><CardContent><Button className="w-full" size="sm" disabled={!canExport || !!busy || !available} onClick={() => void exportReport(template)}>{busy === `${template.id}:${format}` ? "Generating…" : available ? `Generate ${format.toUpperCase()}` : "No synchronized data"}</Button>{template.id !== "license-optimization" && template.id !== "contact-center-operations" && <div className="mt-2 flex flex-wrap gap-1">{(["github","jira","slack"] as const).map((provider) => data.providers.connectedProviders.some((c: any) => c.provider === provider) && <Button key={provider} variant="ghost" size="sm" disabled={busy === `sync:${provider}`} onClick={() => void syncProvider(provider)}>{busy === `sync:${provider}` ? "Syncing…" : `Sync ${provider}`}</Button>)}</div>}{!canExport && <p className="mt-2 text-[11px] text-muted-foreground">Admin or Manager role required to export.</p>}</CardContent></Card>; })}</div>
      <Card className="mt-6"><CardHeader><CardTitle className="text-base">Export history</CardTitle><CardDescription>Real stored exports for this workspace.</CardDescription></CardHeader><CardContent><div className="mb-3 flex gap-2"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports…" /><Input className="w-28" type="number" min="1" value={retention} onChange={(e) => setRetention(e.target.value)} /><Button variant="outline" onClick={() => void saveRetention()}>Retention</Button></div><div className="space-y-2">{filteredHistory.length ? filteredHistory.map((h) => <div key={h.id} className="flex items-center gap-3 rounded-lg border p-3"><FileBarChart className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{h.name}</div><div className="text-xs text-muted-foreground">{h.format.toUpperCase()} · {new Date(h.createdAt).toLocaleString()} · {h.sizeBytes.toLocaleString()} bytes</div></div><Button size="sm" variant="outline" disabled={!!h.purgedAt} onClick={() => void download(h)}><Download className="mr-1.5 h-4 w-4" /> {h.purgedAt ? "Purged" : "Download"}</Button></div>) : <div className="py-10 text-center text-sm text-muted-foreground">No reports generated yet.</div>}</div></CardContent></Card>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-success" /> Reports contain only real connected evidence and tenant-scoped sync data.</div>
    </>}
  </div>;
}
