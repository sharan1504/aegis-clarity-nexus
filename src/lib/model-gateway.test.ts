import { describe, expect, it, vi } from "vitest";

import { LovableModelGateway } from "./model-gateway";

describe("LovableModelGateway", () => {
  it("keeps provider details behind the gateway contract", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "google/gemini-3-flash-preview",
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
    expect(result.model).toBe("google/gemini-3-flash-preview");
    expect(result.usage?.totalTokens).toBe(15);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed when AI access is not configured", async () => {
    const gateway = new LovableModelGateway({ apiKey: undefined });
    await expect(
      gateway.complete({ task: "classification", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow("Lovable AI is not configured");
  });
});
