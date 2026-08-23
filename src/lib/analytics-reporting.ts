import type { ReportRow } from "@/lib/reports-service";
import type { getReportWorkspaceData } from "@/lib/report-workspace.functions";

export type AnalyticsReportTemplate = { id: string; title: string; description: string; requires?: string[] };
export type AnalyticsWorkspaceData = Awaited<ReturnType<typeof getReportWorkspaceData>>;

export const ANALYTICS_REPORT_TEMPLATES: AnalyticsReportTemplate[] = [
  { id: "executive-snapshot", title: "Executive Snapshot", description: "Cross-provider operating posture from connected and successfully synchronized evidence." },
  { id: "license-optimization", title: "License Optimization", description: "Genesys licensing and inactivity signals when Genesys is connected.", requires: ["genesys"] },
  { id: "contact-center-operations", title: "Contact Center Operations", description: "Genesys users, queues and activity when available.", requires: ["genesys"] },
  { id: "devops-health", title: "DevOps Health", description: "Real GitHub repository and Jira issue/project evidence from successful syncs.", requires: ["github", "jira"] },
];

function providerRows(data: AnalyticsWorkspaceData): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const connection of data.providers.connectedProviders) {
    const entities = data.providers.entities.filter((entity: any) => entity.provider === connection.provider);
    if (!entities.length) continue;
    const latest = entities.reduce((value: any, entity: any) => entity.observed_at > value ? entity.observed_at : value, entities[0].observed_at);
    rows.push({ metric: `${connection.display_name ?? connection.provider} synchronized records`, value: String(entities.length), detail: `Last observed ${new Date(latest).toLocaleString()}`, category: "Provider" });
    if (connection.provider === "github") {
      const repos = entities.filter((entity: any) => entity.entity_type === "repository");
      rows.push({ metric: "GitHub repositories", value: String(repos.length), detail: "Repositories returned by the connected GitHub account", category: "DevOps" });
      rows.push({ metric: "GitHub open issues", value: String(repos.reduce((sum: number, entity: any) => sum + Number((entity.payload as Record<string, unknown> | null)?.openIssues ?? 0), 0)), detail: "Open issue counts from synchronized repositories", category: "DevOps" });
    }
    if (connection.provider === "jira") {
      rows.push({ metric: "Jira projects", value: String(entities.filter((entity: any) => entity.entity_type === "project").length), detail: "Projects returned by Jira", category: "ITSM" });
      rows.push({ metric: "Jira issues synchronized", value: String(entities.filter((entity: any) => entity.entity_type === "issue").length), detail: "Issues returned by the synchronized Jira window", category: "ITSM" });
    }
    if (connection.provider === "slack") rows.push({ metric: "Slack channels", value: String(entities.filter((entity: any) => entity.entity_type === "channel").length), detail: "Non-archived channels returned by Slack", category: "Collaboration" });
  }
  return rows;
}

export function rowsForAnalyticsReport(template: AnalyticsReportTemplate, data: AnalyticsWorkspaceData): ReportRow[] {
  const genesys = data.genesys;
  if (template.id === "license-optimization" && genesys.connected) return [
    { metric: "Organization", value: genesys.orgName ?? "Genesys Cloud", detail: `${genesys.region ?? ""} · fetched ${genesys.fetchedAt}`, category: "Source" },
    { metric: "Users", value: String(genesys.users), detail: "Current Genesys user population", category: "License" },
    { metric: "Licensed users", value: String(genesys.licensedUsers), detail: "Users with at least one license assignment", category: "License" },
    { metric: "License assignments", value: String(genesys.licenseAssignments), detail: "Current user-license relationships", category: "License" },
    { metric: "License types", value: String(genesys.licenseTypes), detail: "Current license definitions", category: "License" },
    { metric: "Multiple-license users", value: String(genesys.multipleLicenseUsers), detail: "Users with more than one license", category: "Optimization" },
    { metric: "90+ day inactive licensed users", value: String(genesys.inactiveLicensedUsers), detail: "Review signal; no automatic removal", category: "Optimization" },
  ];
  if (template.id === "contact-center-operations" && genesys.connected) return [
    { metric: "Organization", value: genesys.orgName ?? "Genesys Cloud", detail: `${genesys.region ?? ""} · fetched ${genesys.fetchedAt}`, category: "Source" },
    { metric: "Users", value: String(genesys.users), detail: "Current Genesys users", category: "Operations" },
    { metric: "Active users", value: String(genesys.activeUsers), detail: "Users currently marked active", category: "Operations" },
    { metric: "Queues", value: String(genesys.queues), detail: "Current routing queues", category: "Operations" },
    { metric: "Empty queues", value: String(genesys.emptyQueues), detail: "Queues with zero members", category: "Operations" },
    { metric: "Persisted last sync", value: genesys.lastSyncAt ? new Date(genesys.lastSyncAt).toLocaleString() : "Not available", detail: "Last successful Aegis sync", category: "Freshness" },
  ];
  if (template.id === "devops-health") return providerRows(data).filter((row) => row.category === "DevOps" || row.category === "ITSM");
  const common = providerRows(data);
  if (genesys.connected) common.unshift(
    { metric: "Genesys users", value: String(genesys.users), detail: "Live connected Genesys population", category: "Contact Center" },
    { metric: "Genesys queues", value: String(genesys.queues), detail: "Live connected routing queues", category: "Contact Center" },
  );
  return common;
}

export function hasAnalyticsReportData(template: AnalyticsReportTemplate, data: AnalyticsWorkspaceData): boolean {
  const rows = rowsForAnalyticsReport(template, data);
  if (template.id === "license-optimization" || template.id === "contact-center-operations") return data.genesys.connected && rows.length > 0;
  return rows.length > 0;
}
