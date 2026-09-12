import { describe, expect, it } from "vitest";
import type { ToolDefinition, ToolHandlerResult } from "@lovable.dev/mcp-js";

import { createMcpToolRegistry, getMcpToolCatalog, mcpCatalogText } from "./gateway.server";

const readTool = {
  name: "read_example",
  title: "Read example",
  description: "Reads example facts.",
  handler: async (): Promise<ToolHandlerResult> => ({ content: [{ type: "text", text: "ok" }] }),
} satisfies ToolDefinition;

const proposalTool = {
  name: "propose_example",
  title: "Propose example",
  description: "Creates a governed proposal.",
  handler: async (): Promise<ToolHandlerResult> => ({ content: [{ type: "text", text: "proposal" }] }),
} satisfies ToolDefinition;

describe("MCP Tool Fabric", () => {
  it("centralizes governance metadata and exposes a matching tool surface", () => {
    const registry = createMcpToolRegistry([
      {
        tool: readTool,
        governance: {
          capability: "example_read",
          actionKey: "example.read",
          executionClass: "read_only",
        },
      },
      {
        tool: proposalTool,
        governance: {
          capability: "example_write",
          actionKey: "example.propose",
          executionClass: "low_risk",
        },
      },
    ] as const);

    expect(registry.catalog).toEqual([
      expect.objectContaining({
        name: "read_example",
        capability: "example_read",
        actionKey: "example.read",
        readOnly: true,
        approvalRequired: false,
      }),
      expect.objectContaining({
        name: "propose_example",
        capability: "example_write",
        actionKey: "example.propose",
        readOnly: false,
        approvalRequired: true,
      }),
    ]);
    expect(registry.tools).toHaveLength(2);
    expect(registry.get("propose_example")?.governance.executionClass).toBe("low_risk");
    expect(registry.get("missing")).toBeUndefined();
  });

  it("publishes the active catalog for the metadata tool without exposing handlers", () => {
    const registry = createMcpToolRegistry([
      {
        tool: readTool,
        governance: { capability: "example_read", actionKey: "example.read", executionClass: "read_only" },
      },
    ] as const);

    expect(getMcpToolCatalog()).toEqual(registry.catalog);
    expect(getMcpToolCatalog()[0]).not.toHaveProperty("handler");
    expect(mcpCatalogText(registry.catalog[0])).toContain("example_read");
    expect(mcpCatalogText(registry.catalog[0])).toContain("read-only");
  });
});
