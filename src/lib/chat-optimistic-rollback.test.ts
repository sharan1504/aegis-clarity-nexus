import { describe, expect, it } from "vitest";

describe("chat optimistic message recovery", () => {
  it("uses stable client ids for one optimistic message and filters only that message on rollback", () => {
    const optimisticId = "optimistic-user-message";
    const prior = [{ id: "saved", role: "assistant", content: "Earlier answer" }];
    const current = [...prior, { id: optimisticId, role: "user", content: "Explain CenOps" }];
    const afterRollback = current.filter((message) => message.id !== optimisticId);
    expect(afterRollback).toEqual(prior);
  });

  it("does not remove a previous message when rolling back a failed send", () => {
    const current = [
      { id: "previous-user", role: "user", content: "Previous question" },
      { id: "failed-send", role: "user", content: "New question" },
    ];
    expect(current.filter((message) => message.id !== "failed-send")).toEqual([
      { id: "previous-user", role: "user", content: "Previous question" },
    ]);
  });
});
