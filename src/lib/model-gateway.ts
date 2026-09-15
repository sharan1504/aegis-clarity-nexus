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
}

export interface ModelResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
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

const SUPPORTED_MODEL_PREFIXES = ["google/gemini-", "openai/gpt-5.6-", "openai/gpt-6-astra"] as const;

function isSupportedModel(model: string | undefined): model is string {
  return Boolean(model && SUPPORTED_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix)));
}

function configuredModelForTask(task: ModelTask, explicitModel?: string): string {
  if (isSupportedModel(explicitModel)) return explicitModel;

  const taskEnv = MODEL_ENV_BY_TASK[task];
  const taskModel = process.env[taskEnv];
  if (isSupportedModel(taskModel)) return taskModel;

  // Legacy single-model override remains supported only for an explicit, known model.
  const legacyModel = process.env.CENOPS_AI_MODEL ?? process.env.AEGIS_AI_MODEL;
  if (isSupportedModel(legacyModel)) return legacyModel;

  return DEFAULT_MODEL_BY_TASK[task];
}

export function describeAiGatewayError(status: number, body: string, model: string): string {
  const detail = body.trim().replace(/\s+/g, " ").slice(0, 800);
  if (status === 402) return `AI request failed (402): AI credits or billing are unavailable for this workspace. Model=${model}.`;
  if (status === 401 || status === 403) return `AI request failed (${status}): the Lovable AI credential was rejected or is not authorized. Model=${model}.`;
  if (status === 429) return `AI request failed (429): the AI gateway rate-limited the request. Model=${model}.`;
  return detail
    ? `AI request failed (${status}) for model ${model}: ${detail}`
    : `AI request failed (${status}) for model ${model}: the gateway returned no diagnostic body.`;
}

/** Provider-specific AI access and model selection live behind this server-side adapter. */
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
    if (!this.apiKey) throw new Error("Lovable AI is not configured for this workspace.");

    const model = configuredModelForTask(request.task, this.explicitModel);
    const requestBody: Record<string, unknown> = {
      model,
      messages: request.messages,
      ...(request.json ? { response_format: { type: "json_object" } } : {}),
    };

    // GPT-6 Astra only supports the API default temperature of 1.
    if (!model.startsWith("openai/gpt-6-astra")) {
      requestBody.temperature = request.temperature ?? 0.1;
    }

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const body = await response.text();
    if (!response.ok) throw new Error(describeAiGatewayError(response.status, body, model));

    const parsed = JSON.parse(body) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI returned an empty completion.");

    return {
      content,
      model: parsed.model ?? model,
      provider: "lovable-ai",
      usage: parsed.usage
        ? {
            inputTokens: parsed.usage.prompt_tokens,
            outputTokens: parsed.usage.completion_tokens,
            totalTokens: parsed.usage.total_tokens,
          }
        : undefined,
    };
  }
}

export const defaultModelGateway = new LovableModelGateway();
