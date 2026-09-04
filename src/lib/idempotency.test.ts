import { describe, expect, it } from "vitest";
import { buildIdempotencyKey } from "./idempotency";

describe("idempotency keys", () => {
  it("are deterministic regardless of input property order", () => {
    expect(buildIdempotencyKey("external-ticket", { changeRecordId: "cr-1", system: "Jira" }))
      .toBe(buildIdempotencyKey("external-ticket", { system: "Jira", changeRecordId: "cr-1" }));
  });

  it("changes when the side-effect trigger changes", () => {
    expect(buildIdempotencyKey("external-ticket", { changeRecordId: "cr-1", system: "Jira" }))
      .not.toBe(buildIdempotencyKey("external-ticket", { changeRecordId: "cr-2", system: "Jira" }));
  });
});
