import { describe, expect, it } from "vitest";
import { reconcileGithubEntityKeys } from "./github-connector.server";

describe("GitHub connector reconciliation", () => {
  it("identifies records removed from the latest provider snapshot", () => {
    expect(reconcileGithubEntityKeys([
      "repository:1",
      "workflow_run:10",
      "security_alert:dependabot:acme/app:4",
    ], [
      "repository:1",
      "workflow_run:11",
    ])).toEqual([
      "workflow_run:10",
      "security_alert:dependabot:acme/app:4",
    ]);
  });

  it("does not mark records from another entity scope stale", () => {
    const existing = ["repository:1", "workflow_run:10"];
    const currentWorkflows = ["workflow_run:11"];
    const stale = reconcileGithubEntityKeys(existing.filter((key) => key.startsWith("workflow_run:")), currentWorkflows);
    expect(stale).toEqual(["workflow_run:10"]);
    expect(existing.filter((key) => key.startsWith("repository:"))).toEqual(["repository:1"]);
  });
});

describe("GitHub sync persistence contract", () => {
  it("uses stable entity keys so a retry upserts rather than duplicates", () => {
    const rows = [
      { tenant_id: "tenant-1", connection_id: "connection-1", entity_type: "repository", entity_key: "42" },
      { tenant_id: "tenant-1", connection_id: "connection-1", entity_type: "workflow_run", entity_key: "99" },
    ];
    const keys = new Set(rows.map((row) => `${row.tenant_id}:${row.connection_id}:${row.entity_type}:${row.entity_key}`));
    expect(keys.size).toBe(rows.length);
    expect(keys.has("tenant-1:connection-1:repository:42")).toBe(true);
    expect(keys.has("tenant-1:connection-1:workflow_run:99")).toBe(true);
  });
});
