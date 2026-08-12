import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Download,
  FileBarChart,
  FileJson,
  FileText,
  FileSpreadsheet,
  History,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { reports, reportDatasets, type Report } from "@/lib/mock-data";
import { EmptyIntegrationsState, hasAnyConnected } from "@/components/EmptyIntegrationsState";
import { useTenantContext } from "@/lib/tenant";
import { useRole } from "@/lib/rbac";
import {
  generateReport,
  listReports,
  refreshReportLink,
  type ReportFormat,
  type ReportRow,
  type StoredReport,
} from "@/lib/reports-service";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill } from "@/components/layout/AppLayout";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
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

function ReportsPage() {
  const connected = hasAnyConnected();
  const { tenantId, tenantName } = useTenantContext();
  const { role, can } = useRole();
  const canExport = can("reports.export");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<StoredReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

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

  /** Signed links are short-lived, so every download click mints a fresh one. */
  const download = async (stored: StoredReport) => {
    if (!tenantId) return;
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

  const runExport = async (r: Report, format: ReportFormat) => {
    if (!tenantId) {
      toast.error("Workspace not ready", { description: "Try again in a moment." });
      return;
    }
    if (!canExport) {
      toast.error("Export not permitted", {
        description: `The ${role} role has view-only access to reports.`,
      });
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
      });
      setProgress(100);
      window.open(generated.signedUrl, "_blank", "noopener,noreferrer");
      void loadHistory();
      toast.success(`${label} export ready`, {
        description: `${r.title} stored in your workspace · signed link valid for 5 minutes`,
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

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Executive-ready reports generated on a schedule or on demand. Every export is stored per tenant and delivered through a short-lived signed link."
        actions={
          canExport ? (
            <Button size="sm">
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
                      onClick={() => void runExport(r, "pdf")}
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
                      onClick={() => void runExport(r, "csv")}
                    >
                      {busy === `${r.id}:csv` ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                      )}
                      CSV
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" aria-label="Export report" disabled={pending || !canExport}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => void runExport(r, "pdf")}>
                          <FileText className="mr-2 h-4 w-4" /> Export as PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void runExport(r, "csv")}>
                          <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void runExport(r, "json")}>
                          <FileJson className="mr-2 h-4 w-4" /> Export as JSON
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {pending && <Progress value={progress} className="h-1" />}
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 text-success" />
                    {canExport
                      ? "Tenant-scoped storage · signed link · export audited"
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
                each issuance is written to the immutable audit log.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              {history.length} export{history.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {historyLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Loading export history…</p>
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No exports yet. Generate a PDF, CSV, or JSON export to populate this log.
            </p>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider">Report</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Format</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Size</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Generated</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Audit</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider">
                      Download
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
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
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatBytes(h.sizeBytes)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(h.createdAt).toISOString().replace("T", " ").slice(0, 19)} UTC
                      </TableCell>
                      <TableCell>
                        <StatusPill tone="success" icon={ShieldCheck}>
                          logged
                        </StatusPill>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={downloading === h.id}
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

