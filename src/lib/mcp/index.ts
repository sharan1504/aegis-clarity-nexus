import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getChangeRecord from "./tools/get-change-record";
import getOperationsOverview from "./tools/get-operations-overview";
import listAgents from "./tools/list-agents";
import listChangeRecords from "./tools/list-change-records";
import listIncidentsAndAlerts from "./tools/list-incidents-and-alerts";
import listIntegrations from "./tools/list-integrations";
import listReportsAndRecommendations from "./tools/list-reports-and-recommendations";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged and Vite inlines it at build time.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "aegis-operations-hub",
  title: "Aegis Operations Hub",
  version: "0.1.0",
  instructions:
    "Read-only tools for the Aegis AI enterprise operations platform. Use get_operations_overview for executive KPIs and trends, list_change_records / get_change_record for the Change Control Center (stages, risk scores, approvals, rollback plans, audit history), list_agents for AI agent status and findings, list_integrations for connected systems, list_incidents_and_alerts for operational and security signals, and list_reports_and_recommendations for executive report datasets and pending AI recommendations.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getOperationsOverview,
    listChangeRecords,
    getChangeRecord,
    listAgents,
    listIntegrations,
    listIncidentsAndAlerts,
    listReportsAndRecommendations,
  ],
});
