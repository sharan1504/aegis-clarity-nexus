import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminFrom } = vi.hoisted(() => ({ adminFrom: vi.fn() }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: adminFrom },
}));

import { IntegrationError } from "./errors";
import { consumeOAuthState } from "./store.server";

const stateRow = {
  state: "genesys-state",
  tenant_id: "tenant-123",
  region: "mypurecloud.com",
  redirect_uri: "https://example.com/integrations/genesys/callback",
  expires_at: "2999-01-01T00:00:00.000Z",
  consumed_at: null,
};

function arrangeUpdateResult(data: { state: string } | null, error: { message: string } | null = null) {
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
    maybeSingle: async () => ({ data, error }),
  };
  adminFrom.mockReturnValueOnce(initialQuery).mockReturnValueOnce(updateQuery);
}

describe("Genesys OAuth state consumption", () => {
  beforeEach(() => adminFrom.mockReset());

  it("accepts the callback that atomically consumes the state", async () => {
    arrangeUpdateResult({ state: stateRow.state });
    await expect(consumeOAuthState(stateRow.state, stateRow.tenant_id)).resolves.toEqual({
      region: stateRow.region,
      redirectUri: stateRow.redirect_uri,
    });
  });

  it("returns oauth_state_invalid when the atomic update affects no row", async () => {
    arrangeUpdateResult(null);
    const error = await consumeOAuthState(stateRow.state, stateRow.tenant_id).catch((caught) => caught);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(error.code).toBe("oauth_state_invalid");
  });
});