import { describe, expect, it } from "vitest";
import { isRetryableAgentError, sanitizeTracePayload } from "./agent-execution-controller.server";

describe("agent execution resilience helpers", () => {
  it("retries transient provider failures but not policy or validation failures", () => {
    expect(isRetryableAgentError(new Error("HTTP 503 temporarily unavailable"))).toBe(true);
    expect(isRetryableAgentError(new Error("request timed out"))).toBe(true);
    expect(isRetryableAgentError(new Error("Approval is required"))).toBe(false);
    expect(isRetryableAgentError(new Error("Invalid input schema"))).toBe(false);
  });

  it("redacts credentials in string traces and nested objects", () => {
    expect(sanitizeTracePayload("Authorization: Bearer abc.def.ghi")).toBe("Authorization: Bearer [REDACTED]");
    expect(sanitizeTracePayload({ access_token: "secret-value", nested: ["api_key=secret-value"] })).toEqual({
      access_token: "[REDACTED]",
      nested: ["api_key=[REDACTED]"],
    });
  });

  it("bounds long trace strings", () => {
    expect(String(sanitizeTracePayload("x".repeat(5000))).length).toBe(4000);
  });
});
