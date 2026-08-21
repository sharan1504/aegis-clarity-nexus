import { auth, defineMcp } from "@lovable.dev/mcp-js";

import { guardedTool } from "./guarded";
import getChangeRecord from "./tools/get-change-record";
import getOperationsOverview from "./tools/get-operations-overview";
import listAgents from "./tools/list-agents";
import listChangeRecords from "./tools/list-change-records";
import listIncidentsAndAlerts from "./tools/list-incidents-and-alerts";
import listIntegrations from "./tools/list-integrations";
import listReportsAndRecommendations from "./tools/list-reports-and-recommendations";
import proposeChangeRecord from "./tools/propose-change-record";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "aegis-operations-hub",
  title: "Aegis Operations Hub",
  version: "0.2.0",
  instructions:
    "Aegis exposes governed enterprise operations tools. Read tools provide live tenant-scoped information. propose_change_record is the only write-capable MCP operation: it drafts a Proposed change record with pending approval and enters the normal Aegis approval pipeline. It can never approve a change, choose an execution mode, execute a provider mutation, or mark a record ready/executed. Every tool is identity-verified, tenant-scoped, guardrail-evaluated fail-closed, record-capped and output-sanitized.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    guardedTool(getOperationsOverview, { capability: "operations_overview" }),
    guardedTool(listChangeRecords, { capability: "change_records" }),
    guardedTool(getChangeRecord, { capability: "change_records" }),
    guardedTool(proposeChangeRecord, { capability: "change_records", executionClass: "low_risk", actionKey: "change_records.propose" }),
    guardedTool(listAgents, { capability: "agent_inventory" }),
    guardedTool(listIntegrations, { capability: "integration_inventory" }),
    guardedTool(listIncidentsAndAlerts, { capability: "incident_signals", dataClassification: "internal" }),
    guardedTool(listReportsAndRecommendations, { capability: "report_inventory" }),
  ],
});
