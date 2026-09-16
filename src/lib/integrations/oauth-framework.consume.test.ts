import { describe, expect, it, vi } from "vitest";
import { consumeOAuthState } from "./oauth-framework.server";

type Chain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function makeDb(initial: unknown, consumed: unknown, consumeError: unknown = null) {
  const first: Chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(),
  };
  first.select.mockReturnValue(first);
  first.eq.mockReturnValue(first);
  first.is.mockReturnValue(first);
  first.maybeSingle.mockResolvedValue({ data: initial, error: null });

  const second: Chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(),
  };
  second.update.mockReturnValue(second);
  second.eq.mockReturnValue(second);
  second.is.mockReturnValue(second);
  second.select.mockReturnValue(second);
  second.maybeSingle.mockResolvedValue({ data: consumed, error: consumeError });

  const table = {
    select: vi.fn(() => first),
    update: vi.fn(() => second),
  };

  return { db: { from: vi.fn(() => table) } as never, second };
}

describe("consumeOAuthState atomic consumption", () => {
  const validState = {
    state: "state-1",
    tenant_id: "tenant-1",
    provider: "jira",
    redirect_uri: "https://example.test/callback",
    connection_id: "connection-1",
    metadata: {},
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
  };

  it("returns the state only when the conditional update returns a row", async () => {
    const { db, second } = makeDb(validState, { ...validState, consumed_at: new Date().toISOString() });
    const result = await consumeOAuthState(db, "state-1", "jira");

    expect(result.connectionId).toBe("connection-1");
    expect(second.update).toHaveBeenCalledWith(expect.objectContaining({ consumed_at: expect.any(String) }));
    expect(second.is).toHaveBeenCalledWith("consumed_at", null);
    expect(second.select).toHaveBeenCalled();
  });

  it("rejects when another callback already consumed the state", async () => {
    const { db } = makeDb(validState, null);

    await expect(consumeOAuthState(db, "state-1", "jira"))
      .rejects.toThrow("invalid or already consumed");
  });

  it("rejects when the atomic update itself fails", async () => {
    const { db } = makeDb(validState, null, { message: "db failure" });

    await expect(consumeOAuthState(db, "state-1", "jira"))
      .rejects.toThrow("Unable to consume OAuth state: db failure");
  });
});
