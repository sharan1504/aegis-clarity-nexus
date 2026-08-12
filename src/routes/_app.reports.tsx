import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Download,
  FileBarChart,
  FileJson,
  FileText,
  FileSpreadsheet,
  Loader2,
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
import { generateReport, type ReportFormat, type ReportRow } from "@/lib/reports-service";

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
  const { role } = useRole();
  const [busy, setBusy] = useState<string | null>(null);

  const runExport = async (r: Report, format: ReportFormat) => {
    if (!tenantId) {
      toast.error("Workspace not ready", { description: "Try again in a moment." });
      return;
    }
    const key = `${r.id}:${format}`;
    setBusy(key);
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
      window.open(generated.signedUrl, "_blank", "noopener,noreferrer");
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
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Executive-ready reports generated on a schedule or on demand. Every export is stored per tenant and delivered through a short-lived signed link."
        actions={
          <Button size="sm">
            <FileBarChart className="mr-1.5 h-4 w-4" /> Generate report
          </Button>
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
                      disabled={pending}
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
                      disabled={pending}
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
                        <Button size="sm" variant="ghost" aria-label="Export report" disabled={pending}>
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
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 text-success" />
                    Tenant-scoped storage · signed link · export audited
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

