export type ModelTask =
  | "workflow_planning"
  | "classification"
  | "summarization"
  | "reasoning";

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
const DEFAULT_MODEL = "openai/gpt-6-astra";

/** Provider-specific AI access lives behind this server-side adapter. */
export class LovableModelGateway implements ModelGateway {
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LovableModelGatewayOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.LOVABLE_API_KEY;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.model = options.model ?? DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    if (!this.apiKey) throw new Error("Lovable AI is not configured for this workspace.");

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.1,
        ...(request.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    const body = await response.text();
    if (!response.ok) throw new Error(`AI completion failed (${response.status}).`);

    const parsed = JSON.parse(body) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI returned an empty completion.");

    return {
      content,
      model: parsed.model ?? this.model,
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
