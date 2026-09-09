import getChangeRecord from "./tools/get-change-record";
import getOperationsOverview from "./tools/get-operations-overview";
import listAgents from "./tools/list-agents";
import listAvailableTools from "./tools/list-available-tools";
import listChangeRecords from "./tools/list-change-records";
import listIncidentsAndAlerts from "./tools/list-incidents-and-alerts";
import listIntegrations from "./tools/list-integrations";
import listReportsAndRecommendations from "./tools/list-reports-and-recommendations";
import proposeChangeRecord from "./tools/propose-change-record";
import { createMcpToolRegistry } from "./gateway.server";

/**
 * One registry for the MCP surface. Governance metadata lives beside the tool
 * registration instead of being duplicated in the protocol bootstrap file.
 */
export const MCP_TOOL_REGISTRY = createMcpToolRegistry([
  {
    tool: listAvailableTools,
    governance: { capability: "tool_catalog", actionKey: "mcp.tools.list", executionClass: "read_only" },
  },
  {
    tool: getOperationsOverview,
    governance: { capability: "operations_overview", actionKey: "operations.overview", executionClass: "read_only" },
  },
  {
    tool: listChangeRecords,
    governance: { capability: "change_records", actionKey: "change_records.list", executionClass: "read_only" },
  },
  {
    tool: getChangeRecord,
    governance: { capability: "change_records", actionKey: "change_records.get", executionClass: "read_only" },
  },
  {
    tool: proposeChangeRecord,
    governance: {
      capability: "change_records",
      actionKey: "change_records.propose",
      executionClass: "low_risk",
    },
  },
  {
    tool: listAgents,
    governance: { capability: "agent_inventory", actionKey: "agents.list", executionClass: "read_only" },
  },
  {
    tool: listIntegrations,
    governance: { capability: "integration_inventory", actionKey: "integrations.list", executionClass: "read_only" },
  },
  {
    tool: listIncidentsAndAlerts,
    governance: {
      capability: "incident_signals",
      actionKey: "incidents.list",
      executionClass: "read_only",
      dataClassification: "internal",
    },
  },
  {
    tool: listReportsAndRecommendations,
    governance: { capability: "report_inventory", actionKey: "reports.list", executionClass: "read_only" },
  },
]);

export const MCP_TOOL_CATALOG = MCP_TOOL_REGISTRY.catalog;
