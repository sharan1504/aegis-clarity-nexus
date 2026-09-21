import { writeAiUsageEvent } from "@/lib/ai-usage.server";

export type ModelTask =
  | "workflow_planning"
  | "classification"
  | "summarization"
  | "reasoning"
  | "complex_reasoning";

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelRequest {
  task: ModelTask;
  messages: ModelMessage[];
  temperature?: number;
  json?: boolean;
  agentRunId?: string;
  traceId?: string;
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ModelResponse {
  content: string;
  model: string;
  provider: string;
  usage?: ModelUsage;
}

export class ModelGatewayError extends Error {
  readonly model: string;
  readonly provider: string;
  readonly usage?: ModelUsage;

  constructor(message: string, options: { model: string; provider: string; usage?: ModelUsage }) {
    super(message);
    this.name = "ModelGatewayError";
    this.model = options.model;
    this.provider = options.provider;
    this.usage = options.usage;
  }
}

export interface ModelGateway {
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export interface LovableModelGatewayOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const FAST_MODEL = "google/gemini-3.1-flash-lite";
const STANDARD_MODEL = "google/gemini-3.8-flash";
const REASONING_MODEL = "openai/gpt-6-astra";
const OUT_OF_SCOPE_INTENT_MARKER = "REQUEST INTENT: out_of_scope";
const OUT_OF_SCOPE_RESPONSE = {
  responseType: "product",
  executiveSummary: "That request is outside CenOps scope. CenOps is focused on tenant operations, integrations, agents, guardrails, productivity, risk, and investigations.",
  keyFindings: [],
  metrics: [],
  risks: [],
  opportunities: [],
  recommendations: [],
  whatChanged: [],
  whatRequiresAttention: [],
  evidence: [],
  confidence: 0,
  actionRequired: false,
  followUps: [],
};

const MODEL_ENV_BY_TASK: Record<ModelTask, string> = {
  classification: "CENOPS_FAST_MODEL",
  summarization: "CENOPS_FAST_MODEL",
  workflow_planning: "CENOPS_STANDARD_MODEL",
  reasoning: "CENOPS_STANDARD_MODEL",
  complex_reasoning: "CENOPS_REASONING_MODEL",
};

const DEFAULT_MODEL_BY_TASK: Record<ModelTask, string> = {
  classification: FAST_MODEL,
  summarization: FAST_MODEL,
  workflow_planning: STANDARD_MODEL,
  reasoning: STANDARD_MODEL,
  complex_reasoning: REASONING_MODEL,
};

const SUPPORTED_MODELS = new Set([
  FAST_MODEL,
  STANDARD_MODEL,
  REASONING_MODEL,
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-sol",
]);
const COMPLEX_REASONING_PATTERN = /\b(investigate|investigation|root cause|correlate|correlation|postmortem|forensic|deep dive|why did .* happen|across .* integrations|multi-source|cross-provider)\b/i;

function isSupportedModel(model: string | undefined): model is string {
  return Boolean(model && SUPPORTED_MODELS.has(model));
}

function configuredModelForTask(task: ModelTask, explicitModel?: string): string {
  if (isSupportedModel(explicitModel)) return explicitModel;
  const taskEnv = MODEL_ENV_BY_TASK[task];
  const taskModel = process.env[taskEnv];
  if (isSupportedModel(taskModel)) return taskModel;
  const legacyModel = process.env.CENOPS_AI_MODEL || process.env.AEGIS_AI_MODEL;
  if (isSupportedModel(legacyModel)) return legacyModel;
  return DEFAULT_MODEL_BY_TASK[task];
}

function resolveTask(request: ModelRequest): ModelTask {
  if (request.task !== "reasoning") return request.task;
  const userText = request.messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
  return COMPLEX_REASONING_PATTERN.test(userText) ? "complex_reasoning" : "reasoning";
}

function isOutOfScopeRequest(request: ModelRequest): boolean {
  return request.messages.some((message) => message.role === "system" && message.content.includes(OUT_OF_SCOPE_INTENT_MARKER));
}

function parseUsage(value: unknown): ModelUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const usage = value as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
  const inputTokens = Number.isFinite(Number(usage.prompt_tokens)) ? Number(usage.prompt_tokens) : undefined;
  const outputTokens = Number.isFinite(Number(usage.completion_tokens)) ? Number(usage.completion_tokens) : undefined;
  const totalTokens = Number.isFinite(Number(usage.total_tokens)) ? Number(usage.total_tokens) : undefined;
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;
  return { inputTokens, outputTokens, totalTokens };
}

export function describeAiGatewayError(status: number, body: string, model: string): string {
  const detail = body.trim().replace(/\s+/g, " ").slice(0, 800);
  if (status === 402) return `AI request failed (402): AI credits or billing are unavailable for this workspace. Model=${model}.`;
  if (status === 401 || status === 403) return `AI request failed (${status}): the Lovable AI credential was rejected or is not authorized. Model=${model}.`;
  if (status === 429) return `AI request failed (429): the AI gateway rate-limited the request. Model=${model}.`;
  return detail ? `AI request failed (${status}) for model ${model}: ${detail}` : `AI request failed (${status}) for model ${model}: the gateway returned no diagnostic body.`;
}

export class LovableModelGateway implements ModelGateway {
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly explicitModel: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LovableModelGatewayOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.LOVABLE_API_KEY;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.explicitModel = options.model;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const startedAt = Date.now();
    if (isOutOfScopeRequest(request)) {
      const response = { content: JSON.stringify(OUT_OF_SCOPE_RESPONSE), model: "cenops-scope-guardrail", provider: "cenops" };
      await writeAiUsageEvent(request, undefined, response.model, startedAt);
      return response;
    }

    if (!this.apiKey) throw new Error("Lovable AI is not configured for this workspace.");
    const task = resolveTask(request);
    const model = configuredModelForTask(task, this.explicitModel);
    const requestBody: Record<string, unknown> = { model, messages: request.messages, ...(request.json ? { response_format: { type: "json_object" } } : {}) };
    if (!model.startsWith("openai/gpt-6-astra")) requestBody.temperature = request.temperature ?? 0.1;

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const body = await response.text();
      let parsed: { model?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | undefined;
      try { parsed = JSON.parse(body) as typeof parsed; } catch { parsed = undefined; }
      const usage = parseUsage(parsed?.usage);
      const resolvedModel = parsed?.model ?? model;
      if (!response.ok) {
        const error = new ModelGatewayError(describeAiGatewayError(response.status, body, resolvedModel), { model: resolvedModel, provider: "lovable-ai", usage });
        await writeAiUsageEvent(request, usage, resolvedModel, startedAt);
        throw error;
      }
      const content = parsed?.choices?.[0]?.message?.content;
      if (!content) {
        const error = new ModelGatewayError("AI returned an empty completion.", { model: resolvedModel, provider: "lovable-ai", usage });
        await writeAiUsageEvent(request, usage, resolvedModel, startedAt);
        throw error;
      }
      await writeAiUsageEvent(request, usage, resolvedModel, startedAt);
      return { content, model: resolvedModel, provider: "lovable-ai", usage };
    } catch (error) {
      if (error instanceof ModelGatewayError) throw error;
      throw error;
    }
  }
}

export const defaultModelGateway = new LovableModelGateway();
