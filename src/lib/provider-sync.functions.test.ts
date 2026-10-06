import { describe, expect, it } from "vitest";
import { normalizeProviderReportEntities } from "./provider-sync.functions";

describe("provider evidence normalization", () => {
  it("exposes a real GitHub synced entity through the generic report evidence shape", () => {
    const synced = {
      connection_id: "github-connection",
      entity_type: "repository",
      entity_key: "42",
      payload: { name: "acme/api", pushedAt: "2026-10-06T10:00:00.000Z" },
      synced_at: "2026-10-06T10:05:00.000Z",
    };

    expect(normalizeProviderReportEntities([], [synced])).toEqual([{
      provider: "github",
      connection_id: "github-connection",
      entity_type: "repository",
      entity_key: "42",
      payload: synced.payload,
      observed_at: synced.synced_at,
    }]);
  });

  it("does not fabricate evidence when a provider has not produced a sync snapshot", () => {
    expect(normalizeProviderReportEntities([], [])).toEqual([]);
  });
});
