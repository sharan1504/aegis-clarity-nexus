import { auth, defineMcp } from "@lovable.dev/mcp-js";

import { MCP_TOOL_REGISTRY } from "./gateway-catalog";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "aegis-operations-hub",
  title: "Cenops Operations Hub",
  version: "0.3.0",
  instructions:
    "Cenops exposes governed enterprise operations tools through a central MCP Tool Fabric. Every tool is tenant-scoped and identity-verified, routed through the unified fail-closed governance gate, record-capped and output-sanitized. Read tools provide tenant-scoped information. propose_change_record is the only write-capable MCP operation: it drafts a Proposed change record with pending approval and enters the normal Cenops approval pipeline. MCP never approves a change, selects an execution mode, executes a provider mutation, or bypasses the Capability Router, policy engine or approval boundaries.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: MCP_TOOL_REGISTRY.tools,
});
