// Guardrail enforcement for the MCP tool surface.
//
// An external agent reaching the platform over MCP is NOT a privileged caller.
// Every tool therefore runs through the same unified execution gate as the UI,
// the capability router, workflows and jobs:
//
//   verified identity -> guardrail evaluation -> execution -> record cap -> scrub
//
// A tool cannot opt out, and a denial is returned as a structured, user-safe
// explanation instead of a result. Failure to evaluate guardrails denies the
// call (fail closed).
import { sanitizeOutput } from "@/lib/guardrails/sanitize";
import { runGovernedWithToken, type GovernedOperation } from "@/lib/execution/gateway.server";

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

type AnyTool = {
  name: string;
  handler: (...args: never[]) => unknown;
};

interface ToolCtxLike {
  isAuthenticated?: () => boolean;
  token?: string | undefined;
  userId?: string | undefined;
}

/** What the tool is asking to do, in guardrail terms. */
export interface ToolGovernance {
  /** Stable action identifier. Defaults to the tool name. */
  actionKey?: string;
  executionClass?: GovernedOperation["executionClass"];
  capability?: string | null;
  provider?: string | null;
  dataClassification?: GovernedOperation["dataClassification"];
}

function errorResult(reasons: string[], requiredActions: string[]): ToolResult {
  const lines = [
    "This operation was not permitted by the platform's guardrails.",
    ...reasons.map((r) => `- ${r}`),
    ...(requiredActions.length
      ? ["Required before it can proceed:", ...requiredActions.map((a) => `- ${a}`)]
      : []),
  ];
  return {
    content: [{ type: "text", text: lines.join("\n") }],
    structuredContent: { denied: true, reasons, requiredActions },
    isError: true,
  };
}

export function guardedTool<T extends AnyTool>(tool: T, governance: ToolGovernance = {}): T {
  const original = tool.handler.bind(tool) as (input: unknown, ctx: unknown) => unknown;

  return {
    ...tool,
    handler: async (...args: never[]) => {
      const [input, rawCtx] = args as unknown as [unknown, ToolCtxLike | undefined];
      const ctx = rawCtx ?? {};

      if (ctx.isAuthenticated && !ctx.isAuthenticated()) {
        return {
          content: [{ type: "text", text: "Not authenticated" }],
          isError: true,
        } satisfies ToolResult;
      }

      const outcome = await runGovernedWithToken(
        ctx.token,
        ctx.userId,
        {
          origin: "mcp",
          actionKey: governance.actionKey ?? tool.name,
          executionClass: governance.executionClass ?? "read",
          capability: governance.capability ?? null,
          provider: governance.provider ?? null,
          ...(governance.dataClassification
            ? { dataClassification: governance.dataClassification }
            : {}),
        },
        async () => (await original(input, rawCtx)) as ToolResult,
      );

      if (!outcome.ok) return errorResult(outcome.reasons, outcome.requiredActions);

      // Second scrub: the gate already sanitized, this keeps the guarantee local
      // to the tool boundary even if the gate contract ever changes.
      return sanitizeOutput(outcome.result);
    },
  } as unknown as T;
}
