import { describe, expect, it, vi, afterEach } from "vitest";

import { LovableModelGateway } from "./model-gateway";

describe("LovableModelGateway", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps provider details behind the gateway contract", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "openai/gpt-6-astra",
          choices: [{ message: { content: '{"steps":[]}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200 },
      ),
    );

    const gateway = new LovableModelGateway({
      apiKey: "test-key",
      endpoint: "https://example.test/v1/chat/completions",
      fetchImpl,
    });

    const result = await gateway.complete({
      task: "workflow_planning",
      messages: [{ role: "user", content: "Plan a workflow." }],
      json: true,
    });

    expect(result.provider).toBe("lovable-ai");
    expect(result.model).toBe("openai/gpt-6-astra");
    expect(result.usage?.totalTokens).toBe(15);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"model":"openai/gpt-6-astra"'),
      }),
    );
  });

  it("uses AEGIS_AI_MODEL as the single configurable model override", async () => {
    vi.stubEnv("AEGIS_AI_MODEL", "openai/test-model");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
    );
    const gateway = new LovableModelGateway({ apiKey: "test-key", endpoint: "https://example.test", fetchImpl });

    const result = await gateway.complete({ task: "reasoning", messages: [{ role: "user", content: "x" }] });

    expect(result.model).toBe("openai/test-model");
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test", expect.objectContaining({ body: expect.stringContaining('"model":"openai/test-model"') }));
  });

  it("formats gateway errors with actionable status-specific diagnostics", async () => {
    for (const [status, expected] of [[402, "AI credits or billing are unavailable"], [401, "credential was rejected or is not authorized"], [429, "AI gateway rate-limited"]] as const) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("gateway detail", { status }));
      const gateway = new LovableModelGateway({ apiKey: "test-key", endpoint: "https://example.test", fetchImpl });
      await expect(gateway.complete({ task: "reasoning", messages: [{ role: "user", content: "x" }] })).rejects.toThrow(expected);
    }
  });

  it("fails closed when AI access is not configured", async () => {
    const gateway = new LovableModelGateway({ apiKey: undefined });
    await expect(
      gateway.complete({ task: "classification", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow("Lovable AI is not configured");
  });
});
