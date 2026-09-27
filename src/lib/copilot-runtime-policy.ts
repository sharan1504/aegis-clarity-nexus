import type { CenOpsAiIntentResult, CenOpsConversationTurn } from "@/lib/cenops-ai-intent";

export type CopilotDepth = "quick" | "thorough";

export const CLIENT_CONTEXT_LIMIT = 12;
export const SERVER_CONTEXT_LIMIT = 12;
export const MODEL_CONTEXT_LIMIT = 8;

export function normalizeCopilotDepth(value: unknown): CopilotDepth {
  return value === "thorough" ? "thorough" : "quick";
}

export function boundCopilotContext<T>(messages: T[], limit = SERVER_CONTEXT_LIMIT): T[] {
  return messages.slice(-Math.max(0, limit));
}

export function copilotEvidencePolicy(
  intent: Pick<CenOpsAiIntentResult, "productQuestion" | "requiresLiveEvidence">,
  depth: CopilotDepth,
) {
  const workspace = intent.requiresLiveEvidence || !intent.productQuestion;
  return { workspace, providers: workspace && depth === "thorough" };
}

export function intentConversation(messages: CenOpsConversationTurn[]) {
  return boundCopilotContext(messages, SERVER_CONTEXT_LIMIT);
}