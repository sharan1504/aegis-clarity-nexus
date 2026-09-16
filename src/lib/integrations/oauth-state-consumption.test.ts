import { describe, expect, it } from "vitest";
import { consumeOAuthState } from "./oauth-framework.server";

const stateRow = {
  state: "state-123",
  tenant_id: "tenant-123",
  provider: "jira",
  redirect_uri: "https://example.com/integrations/jira/callback",
  connection_id: "connection-123",
  metadata: {},
  expires_at: "2999-01-01T00:00:00.000Z",
  consumed_at: null,
};

function createDb(updatedRow: typeof stateRow | null, updateError: { message: string } | null = null) {
  const initialQuery = {
    select: () => initialQuery,
    eq: () => initialQuery,
    maybeSingle: async () => ({ data: stateRow, error: null }),
  };
  const updateQuery = {
    update: () => updateQuery,
    eq: () => updateQuery,
    is: () => updateQuery,
    select: () => updateQuery,
    maybeSingle: async () => ({ data: updatedRow, error: updateError }),
  };
  let call = 0;
  return { from: () => (call++ === 0 ? initialQuery : updateQuery) };
}

describe("shared OAuth state consumption", () => {
  it("returns only the row won by the atomic unconsumed-state update", async () => {
    const result = await consumeOAuthState(createDb(stateRow) as never, stateRow.state, "jira");
    expect(result).toMatchObject({ state: stateRow.state, tenantId: stateRow.tenant_id, provider: "jira" });
  });

  it("rejects when another callback already consumed the state", async () => {
    await expect(consumeOAuthState(createDb(null) as never, stateRow.state, "jira"))
      .rejects.toThrow("OAuth state is invalid or already consumed. Please reconnect the integration.");
  });
});