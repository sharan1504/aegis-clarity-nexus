import { describe, expect, it } from "vitest";

type GenesysIntegration = {
  id: string;
  status: string;
  external_org_id: string | null;
  external_org_name: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  health_detail: string | null;
  connected_at: string | null;
  updated_at: string;
};

function mapGenesysIntegration(row: GenesysIntegration) {
  const status = row.status === "connected" ? "connected" : row.status === "disconnected" ? "disconnected" : "failed";
  return {
    id: row.id,
    provider: "genesys",
    status,
    display_name: row.external_org_name || "Genesys Cloud",
    environment: "Production",
    external_id: row.external_org_id,
    credential_expires_at: null,
    last_sync_at: row.last_sync_at,
    last_error: row.last_sync_error || row.health_detail,
    connected_at: row.connected_at,
    updated_at: row.updated_at,
  };
}

describe("unified integration catalog", () => {
  it("maps a connected Genesys integration into the generic connection shape", () => {
    expect(mapGenesysIntegration({
      id: "g-1",
      status: "connected",
      external_org_id: "org-123",
      external_org_name: "Acme Genesys",
      last_sync_at: "2026-08-24T12:00:00Z",
      last_sync_error: null,
      health_detail: null,
      connected_at: "2026-08-24T11:00:00Z",
      updated_at: "2026-08-24T12:00:00Z",
    })).toMatchObject({
      id: "g-1",
      provider: "genesys",
      status: "connected",
      display_name: "Acme Genesys",
      external_id: "org-123",
      environment: "Production",
    });
  });

  it("normalizes non-connected Genesys states to the generic failed state", () => {
    expect(mapGenesysIntegration({
      id: "g-2",
      status: "action_required",
      external_org_id: null,
      external_org_name: null,
      last_sync_at: null,
      last_sync_error: "Token expired",
      health_detail: "Token expired",
      connected_at: null,
      updated_at: "2026-08-24T12:00:00Z",
    }).status).toBe("failed");
  });
});
