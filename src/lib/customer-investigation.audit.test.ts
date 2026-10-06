import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
describe("investigation audit provenance", () => {
  it("produces stable SHA-256 hashes for action payloads", () => {
    const value = { prompt: "customer issue", evidence: [{ provider: "jira", key: "JRA-42" }] };
    const hash = crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"));
  });
});
