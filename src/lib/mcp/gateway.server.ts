import { guardedTool, type ToolGovernance } from "./guarded";

type McpTool = {
  name: string;
  title: string;
  description?: string;
  handler: (...args: never[]) => unknown;
};

export interface McpToolDescriptor {
  name: string;
  title: string;
  description: string;
  capability: string | null;
  actionKey: string;
  executionClass: ToolGovernance["executionClass"];
  provider: string | null;
  readOnly: boolean;
  approvalRequired: boolean;
}

export interface McpToolRegistration<T extends McpTool = McpTool> {
  tool: T;
  governance: ToolGovernance;
}

let activeCatalog: McpToolDescriptor[] = [];

function descriptorFor<T extends McpTool>(registration: McpToolRegistration<T>): McpToolDescriptor {
  const { tool, governance } = registration;
  const executionClass = governance.executionClass ?? "read_only";

  return {
    name: tool.name,
    title: tool.title,
    description: tool.description ?? "Governed Aegis MCP tool.",
    capability: governance.capability ?? null,
    actionKey: governance.actionKey ?? tool.name,
    executionClass,
    provider: governance.provider ?? null,
    readOnly: executionClass === "read_only",
    approvalRequired: executionClass !== "read_only",
  };
}

/**
 * The MCP gateway is the registry/factory between the protocol surface and
 * Aegis governance. Tools are registered once with their policy metadata, then
 * every exposed handler is wrapped by the existing fail-closed governance gate.
 *
 * This deliberately does not contain business decisions or provider calls.
 * Providers remain behind Capability Router / connector boundaries, and MCP
 * remains a caller of those governed surfaces rather than a privileged path.
 */
export function createMcpToolRegistry<const T extends readonly McpToolRegistration[]>(registrations: T) {
  const catalog = registrations.map(descriptorFor);
  const tools = registrations.map(({ tool, governance }) => guardedTool(tool, governance));
  activeCatalog = catalog;

  return {
    catalog,
    tools,
    get(name: string) {
      const index = registrations.findIndex(({ tool }) => tool.name === name);
      return index >= 0 ? registrations[index] : undefined;
    },
    /** Invoke only a registered, already-governed tool. */
    async invoke(name: string, input: unknown, ctx: unknown) {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Unknown MCP tool: ${name}`);
      return tool.handler(input, ctx);
    },
  };
}

export function getMcpToolCatalog(): readonly McpToolDescriptor[] {
  return activeCatalog;
}

export function mcpCatalogText(descriptor: McpToolDescriptor): string {
  const access = descriptor.readOnly ? "read-only" : "write/proposal";
  const approval = descriptor.approvalRequired ? "approval-gated" : "no approval required";
  const capability = descriptor.capability ?? "platform governance";
  return `${descriptor.name}: ${descriptor.description} Capability: ${capability}. Access: ${access}; ${approval}.`;
}
