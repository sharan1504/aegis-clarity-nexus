// Executive report generation. Files are written to the private `reports`
// storage bucket under a per-tenant folder, recorded in the `reports` table,
// and handed to the browser as short-lived signed download links.
import { supabase } from "@/integrations/supabase/client";
import { writeAudit } from "@/lib/audit";
import { pushNotification } from "@/lib/realtime";

export type ReportFormat = "pdf" | "csv" | "json";

export interface ReportRow {
  metric: string;
  value: string;
  detail?: string;
  category?: string;
}

export interface GeneratedReport {
  id: string;
  name: string;
  format: ReportFormat;
  storagePath: string;
  sizeBytes: number;
  signedUrl: string;
  createdAt: string;
}

const SIGNED_URL_TTL_SECONDS = 300;

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(rows: ReportRow[]) {
  const header = ["Metric", "Value", "Detail", "Category"];
  const lines = rows.map((r) =>
    [r.metric, r.value, r.detail ?? "", r.category ?? ""].map((v) => escapeCsv(String(v))).join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Print-ready single-file report. Stored as HTML with a PDF-oriented layout so
 * the artifact stays self-contained and auditable without a native PDF engine.
 */
function toPrintableDocument(name: string, rows: ReportRow[], tenantName: string) {
  const generated = new Date().toISOString();
  const body = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.metric)}</td>
        <td class="num">${escapeHtml(r.value)}</td>
        <td>${escapeHtml(r.detail ?? "")}</td>
        <td>${escapeHtml(r.category ?? "")}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(name)} — Aegis AI</title>
<style>
  @page { size: A4 landscape; margin: 16mm; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; }
  header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #475569; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; color: #475569;
       border-bottom: 1px solid #cbd5e1; padding: 8px 6px; }
  td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.num { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  footer { margin-top: 24px; font-size: 10px; color: #64748b; }
</style></head>
<body>
  <header>
    <h1>${escapeHtml(name)}</h1>
    <div class="meta">${escapeHtml(tenantName)} · generated ${escapeHtml(generated)} · Aegis AI executive report</div>
  </header>
  <table>
    <thead><tr><th>Metric</th><th>Value</th><th>Detail</th><th>Category</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <footer>Confidential — generated from tenant-scoped data. Access is governed by workspace role-based access control.</footer>
</body></html>`;
}

function buildArtifact(
  format: ReportFormat,
  name: string,
  rows: ReportRow[],
  tenantName: string,
): { blob: Blob; extension: string; contentType: string } {
  if (format === "csv") {
    return {
      blob: new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }),
      extension: "csv",
      contentType: "text/csv",
    };
  }
  if (format === "json") {
    const payload = {
      report: name,
      tenant: tenantName,
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      rows,
    };
    return {
      blob: new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      extension: "json",
      contentType: "application/json",
    };
  }
  return {
    blob: new Blob([toPrintableDocument(name, rows, tenantName)], { type: "text/html" }),
    extension: "pdf.html",
    contentType: "text/html",
  };
}

function slug(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Generates a report file, stores it, records it, audits it, and returns a signed link. */
export async function generateReport(opts: {
  tenantId: string;
  tenantName: string;
  dataset: string;
  name: string;
  format: ReportFormat;
  rows: ReportRow[];
  actorRole?: string;
}): Promise<GeneratedReport> {
  const { blob, extension, contentType } = buildArtifact(
    opts.format,
    opts.name,
    opts.rows,
    opts.tenantName,
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = `${opts.tenantId}/${slug(opts.dataset)}-${stamp}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("reports")
    .upload(storagePath, blob, { contentType, upsert: false });
  if (uploadError) throw uploadError;

  const { data: userData } = await supabase.auth.getUser();
  const { data: row, error: insertError } = await supabase
    .from("reports")
    .insert({
      tenant_id: opts.tenantId,
      name: opts.name,
      dataset: opts.dataset,
      format: opts.format,
      storage_path: storagePath,
      size_bytes: blob.size,
      created_by: userData.user?.id ?? null,
    })
    .select("id, created_at")
    .single();
  if (insertError) throw insertError;

  const signedUrl = await createReportLink(storagePath);

  await writeAudit({
    tenantId: opts.tenantId,
    action: "report.generated",
    entityType: "report",
    entityId: row.id,
    actorRole: opts.actorRole,
    detail: `${opts.name} exported as ${opts.format.toUpperCase()} (${opts.rows.length} rows)`,
    payload: { dataset: opts.dataset, format: opts.format, storagePath, sizeBytes: blob.size },
  });

  await pushNotification({
    tenantId: opts.tenantId,
    kind: "info",
    title: `${opts.name} exported (${opts.format.toUpperCase()})`,
    body: `${opts.rows.length} row(s) stored in tenant-scoped storage. A signed download link was issued and recorded in the audit log.`,
    href: "/reports",
  });

  return {
    id: row.id,
    name: opts.name,
    format: opts.format,
    storagePath,
    sizeBytes: blob.size,
    signedUrl,
    createdAt: row.created_at,
  };
}

/** Short-lived signed download URL for a stored report file. */
export async function createReportLink(storagePath: string) {
  const { data, error } = await supabase.storage
    .from("reports")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not create download link");
  return data.signedUrl;
}

export interface StoredReport {
  id: string;
  name: string;
  dataset: string;
  format: ReportFormat;
  storagePath: string;
  sizeBytes: number;
  createdAt: string;
}

export async function listReports(tenantId: string): Promise<StoredReport[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("id, name, dataset, format, storage_path, size_bytes, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    dataset: r.dataset,
    format: r.format as ReportFormat,
    storagePath: r.storage_path,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  }));
}

export async function auditReportDownload(
  tenantId: string,
  report: { id: string; name: string; format: string; storagePath?: string },
  actorRole?: string,
) {
  await writeAudit({
    tenantId,
    action: "report.link_issued",
    entityType: "report",
    entityId: report.id,
    actorRole,
    detail: `${report.name} (${report.format.toUpperCase()}) — signed download link issued`,
    payload: { storagePath: report.storagePath ?? null, ttlSeconds: SIGNED_URL_TTL_SECONDS },
  });
}

/**
 * Re-issues a signed link for a stored report. Signed URLs expire after
 * SIGNED_URL_TTL_SECONDS, so every Download click mints a fresh one and
 * records the issuance in the immutable audit log.
 */
export async function refreshReportLink(
  tenantId: string,
  report: StoredReport,
  actorRole?: string,
): Promise<string> {
  const signedUrl = await createReportLink(report.storagePath);
  await auditReportDownload(
    tenantId,
    { id: report.id, name: report.name, format: report.format, storagePath: report.storagePath },
    actorRole,
  );
  return signedUrl;
}
