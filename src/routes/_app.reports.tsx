import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileBarChart,
  FileJson,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader, StatusPill } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { reports, reportDatasets, type Report } from "@/lib/mock-data";
import { EmptyIntegrationsState, hasAnyConnected } from "@/components/EmptyIntegrationsState";
import { ExportOptionsDialog } from "@/components/ExportOptionsDialog";
import { useTenantContext } from "@/lib/tenant";
import { useRole } from "@/lib/rbac";
import {
  describeParams,
  generateReport,
  listReports,
  refreshReportLink,
  type ReportFormat,
  type ReportParams,
  type ReportRow,
  type StoredReport,
} from "@/lib/reports-service";
import {
  getReportRetentionDays,
  purgeExpiredReports,
  setReportRetentionDays,
} from "@/lib/reports-retention.functions";

interface ReportsSearch {
  export?: string;
}

export const Route = createFileRoute("/_app/reports")({
  validateSearch: (search: Record<string, unknown>): ReportsSearch => ({
    export: typeof search.export === "string" ? search.export : undefined,
  }),
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "Executive Reports & Export History — Aegis AI" },
      {
        name: "description",
        content:
          "Generate PDF, CSV, and JSON executive reports with custom date ranges and sections, then track every export with signed links and retention status.",
      },
      { property: "og:title", content: "Executive Reports & Export History — Aegis AI" },
      {
        property: "og:description",
        content:
          "Parameterised executive exports with signed download links, audit trail, and automatic retention cleanup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://aegis-clarity-nexus.lovable.app/reports" },
    ],
    links: [{ rel: "canonical", href: "https://aegis-clarity-nexus.lovable.app/reports" }],
  }),
});

function sampleRows(r: Report): ReportRow[] {
  const rows = reportDatasets[r.id] ?? [];
  return rows.map((row) => ({
    metric: row.metric,
    value: String(row.value),
    detail: row.detail,
    category: r.category,
  }));
}

const FORMAT_LABEL: Record<ReportFormat, string> = { pdf: "PDF", csv: "CSV", json: "JSON" };

type StatusFilter = "all" | "available" | "purged";
type FormatFilter = "all" | ReportFormat;

function ReportsPage() {
  const connected = hasAnyConnected();
  const { tenantId, tenantName } = useTenantContext();
  const { role, can } = useRole();
  const navigate = useNavigate({ from: Route.fullPath });
  const { export: deepLinkId } = Route.useSearch();
  const canExport = can("reports.export");
  const isAdmin = role === "Admin";

  const purge = useServerFn(purgeExpiredReports);
  const readRetention = useServerFn(getReportRetentionDays);
  const writeRetention = useServerFn(setReportRetentionDays);

  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<StoredReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [retentionDraft, setRetentionDraft] = useState("30");
  const [savingRetention, setSavingRetention] = useState(false);

  // Filters
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");

  // Export dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogReport, setDialogReport] = useState<Report | null>(null);
  const [dialogFormat, setDialogFormat] = useState<ReportFormat>("pdf");

  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  const loadHistory = useCallback(async () => {
    if (!tenantId) return;
    try {
      setHistory(await listReports(tenantId));
    } catch {
      /* history is non-critical; keep the page usable */
    } finally {
      setHistoryLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Retention policy: read the workspace window, then sweep expired files.
  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    void (async () => {
      try {
        const { retentionDays: days } = await readRetention({});
        if (!active) return;
        setRetentionDays(days);
        setRetentionDraft(String(days));
        // The sweep deletes stored files, so the server restricts it to
        // workspace admins; skip the call entirely for everyone else.
        if (!isAdmin) return;
        const result = await purge({});
        if (!active) return;
        if (result.purged > 0) {
          toast.info("Retention policy applied", {
            description: `${result.purged} export file(s) older than ${result.retentionDays} days were deleted from storage. History entries were kept.`,
          });
          void loadHistory();
        }
      } catch {
        /* retention sweep is best-effort */
      }
    })();
    return () => {
      active = false;
    };
  }, [tenantId, readRetention, purge, loadHistory]);

  useEffect(() => {
    if (deepLinkId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [deepLinkId, history]);

  const saveRetention = async () => {
    setSavingRetention(true);
    try {
      const { retentionDays: days } = await writeRetention({
        data: { days: Number(retentionDraft) },
      });
      setRetentionDays(days);
      toast.success("Retention policy updated", {
        description: `Export files are deleted from storage after ${days} days. Metadata and audit entries are retained.`,
      });
    } catch (err) {
      toast.error("Could not update retention policy", {
        description: err instanceof Error ? err.message : "Please retry.",
      });
      setRetentionDraft(String(retentionDays));
    } finally {
      setSavingRetention(false);
    }
  };

  /** Signed links are short-lived, so every download click mints a fresh one. */
  const download = async (stored: StoredReport) => {
    if (!tenantId) return;
    if (stored.purgedAt) {
      toast.error("File no longer stored", {
        description: `Removed by the ${retentionDays}-day retention policy. Re-generate this export to get a fresh file.`,
      });
      return;
    }
    setDownloading(stored.id);
    try {
      const url = await refreshReportLink(tenantId, stored, role);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Fresh download link issued", {
        description: `${stored.name} · valid for 5 minutes · issuance audited`,
      });
    } catch (err) {
      toast.error("Could not refresh download link", {
        description: err instanceof Error ? err.message : "Please retry.",
      });
    } finally {
      setDownloading(null);
    }
  };

  const openDialog = (r: Report, format: ReportFormat) => {
    if (!canExport) {
      toast.error("Export not permitted", {
        description: `The ${role} role has view-only access to reports.`,
      });
      return;
    }
    setDialogReport(r);
    setDialogFormat(format);
    setDialogOpen(true);
  };

  const runExport = async (r: Report, format: ReportFormat, params: ReportParams) => {
    if (!tenantId) {
      toast.error("Workspace not ready", { description: "Try again in a moment." });
      return;
    }
    const key = `${r.id}:${format}`;
    setBusy(key);
    setProgress(15);
    const ticker = window.setInterval(() => setProgress((p) => (p < 85 ? p + 12 : p)), 220);
    const label = FORMAT_LABEL[format];
    try {
      const generated = await generateReport({
        tenantId,
        tenantName: tenantName ?? "Workspace",
        dataset: r.id,
        name: r.title,
        format,
        rows: sampleRows(r),
        actorRole: role,
        params,
        retentionDays,
      });
      setProgress(100);
      setDialogOpen(false);
      window.open(generated.signedUrl, "_blank", "noopener,noreferrer");
      void loadHistory();
      void navigate({ search: { export: generated.id } });
      toast.success(`${label} export ready`, {
        description: `${r.title} · ${describeParams(params)} · signed link valid for 5 minutes`,
        action: {
          label: "Download",
          onClick: () => window.open(generated.signedUrl, "_blank", "noopener,noreferrer"),
        },
      });
    } catch (err) {
      toast.error(`${label} export failed`, {
        description: err instanceof Error ? err.message : "Please retry.",
      });
    } finally {
      window.clearInterval(ticker);
      setBusy(null);
      setProgress(0);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history.filter((h) => {
      if (q && !`${h.name} ${h.dataset}`.toLowerCase().includes(q)) return false;
      if (formatFilter !== "all" && h.format !== formatFilter) return false;
      if (statusFilter === "available" && h.purgedAt) return false;
      if (statusFilter === "purged" && !h.purgedAt) return false;
      const day = h.createdAt.slice(0, 10);
      if (fromFilter && day < fromFilter) return false;
      if (toFilter && day > toFilter) return false;
      return true;
    });
  }, [history, query, formatFilter, statusFilter, fromFilter, toFilter]);

  const filtersActive =
    query !== "" || formatFilter !== "all" || statusFilter !== "all" || fromFilter || toFilter;

  const clearFilters = () => {
    setQuery("");
    setFormatFilter("all");
    setStatusFilter("all");
    setFromFilter("");
    setToFilter("");
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Executive-ready reports generated on a schedule or on demand. Every export is stored per tenant, delivered through a short-lived signed link, and removed from storage once the retention window closes."
        actions={
          canExport ? (
            <Button size="sm" onClick={() => openDialog(reports[0]!, "pdf")}>
              <FileBarChart className="mr-1.5 h-4 w-4" /> Generate report
            </Button>
          ) : (
            <StatusPill tone="info" icon={Lock}>
              View-only ({role})
            </StatusPill>
          )
        }
      />

      {!connected ? (
        <EmptyIntegrationsState
          title="No data to report yet"
          description="Connect an integration and Aegis will start generating executive reports automatically."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((r) => {
            const pending = busy?.startsWith(`${r.id}:`) ?? false;
            return (
              <Card key={r.id} className="transition hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                      <FileBarChart className="h-5 w-5" />
                    </div>
                    <Badge variant="outline">{r.category}</Badge>
                  </div>
                  <CardTitle className="mt-3 text-base">{r.title}</CardTitle>
                  <CardDescription>
                    Owner: {r.owner} • Updated {r.updated}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={pending || !canExport}
                      onClick={() => openDialog(r, "pdf")}
                    >
                      {busy === `${r.id}:pdf` ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="mr-1.5 h-4 w-4" />
                      )}
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={pending || !canExport}
                      onClick={() => openDialog(r, "csv")}
                    >
                      {busy === `${r.id}:csv` ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                      )}
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Export as JSON"
                      disabled={pending || !canExport}
                      onClick={() => openDialog(r, "json")}
                    >
                      <FileJson className="h-4 w-4" />
                    </Button>
                  </div>
                  {pending && <Progress value={progress} className="h-1" />}
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 text-success" />
                    {canExport
                      ? "Choose period & sections · signed link · parameters audited"
                      : "Exports require Admin or Manager role"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-primary" /> Export history
              </CardTitle>
              <CardDescription className="text-xs">
                Every export stored for this workspace. Download links are re-issued on demand and
                each issuance is written to the immutable audit log. Files are deleted from storage
                after {retentionDays} days; history and audit entries are kept forever.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill tone="info" icon={Timer}>
                Retention {retentionDays}d
              </StatusPill>
              <Badge variant="outline" className="font-mono text-[10px]">
                {filtered.length}/{history.length} export{history.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>

          {isAdmin && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
              <div className="space-y-1">
                <Label
                  htmlFor="retention"
                  className="text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  Retention policy (days)
                </Label>
                <Input
                  id="retention"
                  type="number"
                  min={1}
                  max={365}
                  value={retentionDraft}
                  onChange={(e) => setRetentionDraft(e.target.value)}
                  className="h-8 w-28 font-mono text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={savingRetention || retentionDraft === String(retentionDays)}
                onClick={() => void saveRetention()}
              >
                {savingRetention ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Apply
              </Button>
              <p className="flex-1 text-[11px] text-muted-foreground">
                Stored files older than this window are deleted automatically on the next visit;
                the export record, chosen parameters, and audit trail remain intact.
              </p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search report or dataset…"
                className="h-8 pl-8 text-xs"
                aria-label="Search export history"
              />
            </div>
            <Select
              value={formatFilter}
              onValueChange={(v) => setFormatFilter(v as FormatFilter)}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Filter by format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All formats</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="purged">Purged</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={fromFilter}
              max={toFilter || undefined}
              onChange={(e) => setFromFilter(e.target.value)}
              className="h-8 w-[140px] font-mono text-xs"
              aria-label="Generated from"
            />
            <Input
              type="date"
              value={toFilter}
              min={fromFilter || undefined}
              onChange={(e) => setToFilter(e.target.value)}
              className="h-8 w-[140px] font-mono text-xs"
              aria-label="Generated to"
            />
            {filtersActive && (
              <Button size="sm" variant="ghost" className="h-8" onClick={clearFilters}>
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {historyLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Loading export history…</p>
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No exports yet. Generate a PDF, CSV, or JSON export to populate this log.
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No exports match the current filters.
            </p>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider">Report</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Format</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      Parameters
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Size</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Generated</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider">
                      Download
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((h) => {
                    const highlighted = h.id === deepLinkId;
                    return (
                      <TableRow
                        key={h.id}
                        ref={highlighted ? highlightRef : undefined}
                        className={highlighted ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : undefined}
                      >
                        <TableCell className="max-w-[220px] truncate text-sm font-medium">
                          {h.name}
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {h.dataset}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {FORMAT_LABEL[h.format]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">
                          {h.params ? describeParams(h.params) : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatBytes(h.sizeBytes)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(h.createdAt).toISOString().replace("T", " ").slice(0, 19)} UTC
                        </TableCell>
                        <TableCell>
                          {h.purgedAt ? (
                            <StatusPill tone="warning" icon={Trash2}>
                              purged
                            </StatusPill>
                          ) : (
                            <StatusPill tone="success" icon={ShieldCheck}>
                              available
                            </StatusPill>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={downloading === h.id || !!h.purgedAt}
                            aria-label={`Download ${h.format.toUpperCase()} export ${h.id}`}
                            onClick={() => void download(h)}
                          >
                            {downloading === h.id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Download
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogReport && (
        <ExportOptionsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          reportTitle={dialogReport.title}
          initialFormat={dialogFormat}
          busy={busy !== null}
          onConfirm={(format, params) => void runExport(dialogReport, format, params)}
        />
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
