// Guardrail enforcement for the MCP tool surface.
//
// Every tool response passes through output sanitization, so the platform's
// "no credential exposure" guardrail holds for external agents too — even if a
// tool, connector or upstream payload ever carries a token-shaped value.
import { sanitizeOutput } from "@/lib/guardrails/sanitize";

type AnyTool = { handler: (...args: never[]) => unknown };

export function guardedTool<T extends AnyTool>(tool: T): T {
  const original = tool.handler.bind(tool) as (...args: never[]) => unknown;
  return {
    ...tool,
    handler: async (...args: never[]) => sanitizeOutput(await original(...args)),
  } as T;
}
