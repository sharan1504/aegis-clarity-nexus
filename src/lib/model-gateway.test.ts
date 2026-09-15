import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LovableModelGateway } from "./model-gateway";

const jsonResponse = (payload: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  }) as Response;

const textResponse = (body: string, status: number) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }) as Response;

describe("LovableModelGateway", () => {
  beforeEach(() => {
    // CI may define model variables. Reset all router inputs so default-routing tests
    // exercise the governed built-in policy rather than the runner's environment.
    vi.stubEnv("CENOPS_FAST_MODEL", "");
    vi.stubEnv("CENOPS_STANDARD_MODEL", "");
    vi.stubEnv("CENOPS_REASONING_MODEL", "");
    vi.stubEnv("CENOPS_AI_MODEL", "");
    vi.stubEnv("AEGIS_AI_MODEL", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("routes workflow planning to the standard Gemini model by default", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    const gateway = new LovableModelGateway({ apiKey: "test-key", endpoint: "https://example.test", fetchImpl });

    const result = await gateway.complete({ task: "workflow_planning", messages: [{ role: "user", content: "Plan a workflow." }] });

    expect(result.model).toBe("google/gemini-3.8-flash");
  });

  it("routes classification and summarization to the low-cost Gemini model", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    const gateway = new LovableModelGateway({ apiKey: "test-key", endpoint: "https://example.test", fetchImpl });

    await gateway.complete({ task: "classification", messages: [{ role: "user", content: "classify" }] });
    await gateway.complete({ task: "summarization", messages: [{ role: "user", content: "summarize" }] });

    const models = fetchImpl.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).model);
    expect(models).toEqual(["google/gemini-3.1-flash-lite", "google/gemini-3.1-flash-lite"]);
  });

  it("routes complex reasoning to Astra", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    const gateway = new LovableModelGateway({ apiKey: "test-key", endpoint: "https://example.test", fetchImpl });

    const result = await gateway.complete({ task: "complex_reasoning", messages: [{ role: "user", content: "investigate root cause" }] });

    expect(result.model).toBe("openai/gpt-6-astra");
    const [, options] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(options?.body))).not.toHaveProperty("temperature");
  });

  it("automatically escalates complex enterprise investigations from normal reasoning", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    const gateway = new LovableModelGateway({ apiKey: "test-key", endpoint: "https://example.test", fetchImpl });

    const result = await gateway.complete({
      task: "reasoning",
      messages: [{ role: "user", content: "Investigate the root cause across multiple integrations and correlate the evidence." }],
    });

    expect(result.model).toBe("openai/gpt-6-astra");
  });

  it("allows task-specific model overrides", async () => {
    vi.stubEnv("CENOPS_STANDARD_MODEL", "openai/gpt-5.6-terra");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    const gateway = new LovableModelGateway({ apiKey: "test-key", endpoint: "https://example.test", fetchImpl });

    const result = await gateway.complete({ task: "reasoning", messages: [{ role: "user", content: "x" }] });

    expect(result.model).toBe("openai/gpt-5.6-terra");
  });

  it("ignores a stale unsupported task override and keeps the governed default", async () => {
    vi.stubEnv("CENOPS_STANDARD_MODEL", "google/gemini-2.5-flash");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    const gateway = new LovableModelGateway({ apiKey: "test-key", endpoint: "https://example.test", fetchImpl });

    const result = await gateway.complete({ task: "reasoning", messages: [{ role: "user", content: "x" }] });

    expect(result.model).toBe("google/gemini-3.8-flash");
  });

  it("supports a known legacy OpenAI model override", async () => {
    vi.stubEnv("AEGIS_AI_MODEL", "openai/gpt-5.6-terra");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    const gateway = new LovableModelGateway({ apiKey: "test-key", endpoint: "https://example.test", fetchImpl });

    const result = await gateway.complete({ task: "reasoning", messages: [{ role: "user", content: "x" }] });

    expect(result.model).toBe("openai/gpt-5.6-terra");
  });

  it("formats gateway errors with actionable status-specific diagnostics", async () => {
    for (const [status, expected] of [
      [402, "AI credits or billing are unavailable"],
      [401, "credential was rejected or is not authorized"],
      [429, "AI gateway rate-limited"],
    ] as const) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(textResponse("gateway detail", status));
      const gateway = new LovableModelGateway({ apiKey: "test-key", endpoint: "https://example.test", fetchImpl });
      await expect(gateway.complete({ task: "reasoning", messages: [{ role: "user", content: "x" }] })).rejects.toThrow(expected);
    }
  });

  it("fails closed when AI access is not configured", async () => {
    const gateway = new LovableModelGateway({ apiKey: undefined });
    await expect(gateway.complete({ task: "classification", messages: [{ role: "user", content: "x" }] })).rejects.toThrow("Lovable AI is not configured");
  });
});
