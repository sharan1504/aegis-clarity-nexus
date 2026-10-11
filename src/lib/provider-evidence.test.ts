import { describe, expect, it } from "vitest";
import { deriveCorrelatedSignals, normalizeProviderReportEntities } from "./provider-evidence";

describe("provider evidence helpers", () => {
  it("exposes a real GitHub synced entity through the generic report evidence shape", () => {
    const synced = { connection_id: "github-connection", entity_type: "repository", entity_key: "42", payload: { name: "acme/api", pushedAt: "2026-10-06T10:00:00.000Z" }, synced_at: "2026-10-06T10:05:00.000Z" };
    expect(normalizeProviderReportEntities([], [synced])).toEqual([{ provider: "github", connection_id: "github-connection", entity_type: "repository", entity_key: "42", payload: synced.payload, observed_at: synced.synced_at }]);
  });

  it("does not fabricate evidence when a provider has not produced a sync snapshot", () => {
    expect(normalizeProviderReportEntities([], [])).toEqual([]);
  });

  it("correlates a non-GitHub provider pair using shared timestamps", () => {
    const m365 = { provider: "m365", entity_type: "license", entity_key: "sku-1", observed_at: "2026-10-06T10:06:00.000Z", payload: { name: "Microsoft 365 E3", snapshotAt: "2026-10-06T09:55:00.000Z" } };
    const jira = { provider: "jira", entity_type: "issue", entity_key: "10001", observed_at: "2026-10-06T10:05:00.000Z", payload: { key: "OPS-42", summary: "License sync issue", updated: "2026-10-06T10:00:00.000Z" } };
    const signals = deriveCorrelatedSignals([m365, jira]);
    expect(signals).toHaveLength(1);
    expect(signals[0].providers).toEqual(["Jira", "M365"]);
    expect(signals[0].detail).toContain("temporal correlation only");
    expect(signals[0].detail).toContain("CenOps does not infer causation");
  });

  it("keeps the existing GitHub/Jira case while using the generic path", () => {
    const github = { provider: "github", entity_type: "repository", entity_key: "repo-1", observed_at: "2026-10-06T10:04:00.000Z", payload: { name: "acme/api", pushedAt: "2026-10-06T10:00:00.000Z" } };
    const jira = { provider: "jira", entity_type: "issue", entity_key: "10001", observed_at: "2026-10-06T10:05:00.000Z", payload: { key: "OPS-42", updated: "2026-10-06T10:00:00.000Z" } };
    const signals = deriveCorrelatedSignals([github, jira]);
    expect(signals).toHaveLength(1);
    expect(signals[0].providers).toEqual(["GitHub", "Jira"]);
  });

  it("caps correlation output at ten signals", () => {
    const jira = { provider: "jira", entity_type: "issue", entity_key: "10001", observed_at: "2026-10-06T10:05:00.000Z", payload: { key: "OPS-42", updated: "2026-10-06T10:00:00.000Z" } };
    const left = Array.from({ length: 11 }, (_, index) => ({ provider: "m365", entity_type: "license", entity_key: `sku-${index}`, observed_at: "2026-10-06T10:00:00.000Z", payload: { name: `SKU ${index}`, snapshotAt: "2026-10-06T10:00:00.000Z" } }));
    expect(deriveCorrelatedSignals([...left, jira])).toHaveLength(10);
  });
});