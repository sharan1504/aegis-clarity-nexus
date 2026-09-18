import type { ReportRow } from "@/lib/reports-service";
import type { getReportWorkspaceData } from "@/lib/report-workspace.functions";
import type { NormalizedEntitlement } from "@/lib/capabilities/registry";

export type AnalyticsReportTemplate = { id: string; title: string; description: string; requires?: string[] };
export type AnalyticsWorkspaceData = Awaited<ReturnType<typeof getReportWorkspaceData>>;

export const ANALYTICS_REPORT_TEMPLATES: AnalyticsReportTemplate[] = [
  { id: "executive-snapshot", title: "Executive Snapshot", description: "Cross-provider operating posture from connected and successfully synchronized evidence." },
  { id: "license-optimization", title: "License Optimization", description: "Seat and license assignment posture across connected providers that expose license inventory (e.g. Genesys, Microsoft 365, and others when available)." },
  { id: "contact-center-operations", title: "Contact Center Operations", description: "Genesys users, queues and activity when available.", requires: ["genesys"] },
  { id: "devops-health", title: "DevOps Health", description: "Real GitHub repository and Jira issue/project evidence from successful syncs.", requires: ["github", "jira"] },
];

function providerRows(data: AnalyticsWorkspaceData): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const connection of data.providers.connectedProviders) {
    const entities = data.providers.entities.filter((entity: any) => entity.provider === connection.provider && entity.connection_id === connection.id);
    if (!entities.length) continue;
    const latest = entities.reduce((value: any, entity: any) => entity.observed_at > value ? entity.observed_at : value, entities[0].observed_at);
    rows.push({ metric: `${connection.display_name ?? connection.provider} synchronized records`, value: String(entities.length), detail: `Last observed ${new Date(latest).toLocaleString()}`, category: "Provider" });
    if (connection.provider === "github") { const repos = entities.filter((entity: any) => entity.entity_type === "repository"); rows.push({ metric: "GitHub repositories", value: String(repos.length), detail: "Repositories returned by the connected GitHub account", category: "DevOps" }); rows.push({ metric: "GitHub open issues", value: String(repos.reduce((sum: number, entity: any) => sum + Number((entity.payload as Record<string, unknown> | null)?.openIssues ?? 0), 0)), detail: "Open issue counts from synchronized repositories", category: "DevOps" }); }
    if (connection.provider === "jira") { rows.push({ metric: "Jira projects", value: String(entities.filter((entity: any) => entity.entity_type === "project").length), detail: "Projects returned by Jira", category: "ITSM" }); rows.push({ metric: "Jira issues synchronized", value: String(entities.filter((entity: any) => entity.entity_type === "issue").length), detail: "Issues returned by the synchronized Jira window", category: "ITSM" }); }
    if (connection.provider === "slack") rows.push({ metric: "Slack channels", value: String(entities.filter((entity: any) => entity.entity_type === "channel").length), detail: "Non-archived channels returned by Slack", category: "Collaboration" });
  }
  return rows;
}

function licenseRows(data: AnalyticsWorkspaceData): ReportRow[] {
  const records = data.license.records as NormalizedEntitlement[];
  if (!records.length) return [];
  const sourceMeta = new Map(data.license.sources.map((source) => [source.integrationId, source]));
  const grouped = new Map<string, NormalizedEntitlement[]>();
  for (const record of records) { const key = `${record.provider}::${record.integrationId}`; const group = grouped.get(key) ?? []; group.push(record); grouped.set(key, group); }
  const rows: ReportRow[] = [
    { metric: "Providers contributing license evidence", value: String(new Set(records.map((record) => record.provider)).size), detail: "Connected sources with normalized license inventory", category: "License" },
    { metric: "License assignments", value: String(records.length), detail: "Evidence-backed user-to-license assignment rows", category: "License" },
  ];
  let multiLicenseUsers = 0;
  for (const [sourceKey, group] of grouped) {
    const [provider, integrationId] = sourceKey.split("::");
    const displayName = sourceMeta.get(integrationId)?.displayName ?? `${provider} (${integrationId})`;
    const byUser = new Map<string, Set<string>>();
    for (const record of group) { const licenses = byUser.get(record.userId) ?? new Set<string>(); licenses.add(record.entitlementId); byUser.set(record.userId, licenses); }
    const multi = [...byUser.values()].filter((licenses) => licenses.size > 1).length; multiLicenseUsers += multi;
    const withoutActivity = group.filter((record) => !record.lastActivityAt).length;
    rows.push({ metric: `${displayName} assignments`, value: String(group.length), detail: `${new Set(group.map((record) => record.entitlementId)).size} distinct license types`, category: "License" });
    rows.push({ metric: `${displayName} multi-license users`, value: String(multi), detail: "Users with more than one distinct license in this provider instance", category: "Optimization" });
    rows.push({ metric: `${displayName} assignments without activity timestamp`, value: String(withoutActivity), detail: withoutActivity ? "Limitation: no reliable last-activity evidence for these assignments" : "All assignment rows include a last-activity timestamp", category: "Limitations" });
  }
  rows.push({ metric: "Multi-license users", value: String(multiLicenseUsers), detail: "Sum of per-provider-instance multi-license users; users are not de-duplicated across instances", category: "Optimization" });
  rows.push({ metric: "Reclamation guidance", value: "Evidence review only", detail: "No automatic reclaim/remove recommendation without reliable activity evidence", category: "Limitations" });
  for (const warning of data.license.warnings) rows.push({ metric: "License inventory limitation", value: "Provider unavailable", detail: warning, category: "Limitations" });
  return rows;
}

export function rowsForAnalyticsReport(template: AnalyticsReportTemplate, data: AnalyticsWorkspaceData): ReportRow[] {
  if (template.id === "license-optimization") return licenseRows(data);
  const genesys = data.genesys;
  if (template.id === "contact-center-operations" && genesys.connected) return [
    { metric: "Organization", value: genesys.orgName ?? "Genesys Cloud", detail: `${genesys.region ?? ""} · fetched ${genesys.fetchedAt}`, category: "Source" },
    { metric: "Users", value: String(genesys.users), detail: "Current Genesys users", category: "Operations" },
    { metric: "Active users", value: String(genesys.activeUsers), detail: "Users currently marked active", category: "Operations" },
    { metric: "Queues", value: String(genesys.queues), detail: "Current routing queues", category: "Operations" },
    { metric: "Empty queues", value: String(genesys.emptyQueues), detail: "Queues with zero members", category: "Operations" },
    { metric: "Persisted last sync", value: genesys.lastSyncAt ? new Date(genesys.lastSyncAt).toLocaleString() : "Not available", detail: "Last successful Aegis sync", category: "Freshness" },
  ];
  if (template.id === "devops-health") return providerRows(data).filter((row) => row.category === "DevOps" || row.category === "ITSM");
  const common = providerRows(data); if (genesys.connected) common.unshift({ metric: "Genesys users", value: String(genesys.users), detail: "Live connected Genesys population", category: "Contact Center" }, { metric: "Genesys queues", value: String(genesys.queues), detail: "Live connected routing queues", category: "Contact Center" }); return common;
}

export function hasAnalyticsReportData(template: AnalyticsReportTemplate, data: AnalyticsWorkspaceData): boolean {
  if (template.id === "license-optimization") return data.license.records.length > 0;
  const rows = rowsForAnalyticsReport(template, data); if (template.id === "contact-center-operations") return data.genesys.connected && rows.length > 0; return rows.length > 0;
}
