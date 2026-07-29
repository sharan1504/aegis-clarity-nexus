import { createFileRoute } from "@tanstack/react-router";
import { Download, FileBarChart, FileJson, FileText, FileSpreadsheet } from "lucide-react";

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

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

function sampleRows(r: Report) {
  const rows = reportDatasets[r.id] ?? [];
  return rows.map((row) => ({ ...row, category: r.category }));
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportJson(r: Report) {
  const payload = { report: r, rows: sampleRows(r), generatedAt: new Date().toISOString() };
  download(`${r.id}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function exportCsv(r: Report) {
  const rows = sampleRows(r);
  const header = "metric,value,detail,category";
  const body = rows
    .map((row) => `"${row.metric}","${row.value}","${row.detail}","${row.category}"`)
    .join("\n");
  download(`${r.id}.csv`, `${header}\n${body}`, "text/csv");
}

function exportPdf(r: Report) {
  // Lightweight client-side PDF via print-to-PDF window.
  const rows = sampleRows(r);
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${r.title}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:40px;color:#111}
      h1{margin:0 0 4px;font-size:24px}
      .meta{color:#666;font-size:12px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eee}
      th{background:#f6f7f9}
    </style></head><body>
    <h1>${r.title}</h1>
    <div class="meta">${r.category} • Owner: ${r.owner} • Updated ${r.updated} • Generated ${new Date().toLocaleString()}</div>
    <table><thead><tr><th>Metric</th><th>Value</th><th>Detail</th></tr></thead><tbody>
    ${rows.map((row) => `<tr><td>${row.metric}</td><td>${row.value}</td><td>${row.detail}</td></tr>`).join("")}
    </tbody></table>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`);
  win.document.close();
}

function ReportsPage() {
  const connected = hasAnyConnected();
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Executive-ready reports generated on a schedule or on demand."
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
          {reports.map((r) => (
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
              <CardContent className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => exportPdf(r)}>
                  <FileText className="mr-1.5 h-4 w-4" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => exportCsv(r)}>
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" /> CSV
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" aria-label="Export report">
                      <Download className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => exportPdf(r)}>
                      <FileText className="mr-2 h-4 w-4" /> Export as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => exportCsv(r)}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => exportJson(r)}>
                      <FileJson className="mr-2 h-4 w-4" /> Export as JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
