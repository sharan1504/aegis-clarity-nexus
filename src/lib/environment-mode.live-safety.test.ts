import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const formerDemoCallSites = [
  "enterprise-chat.functions.ts",
  "change-service.ts",
  "chat-history.functions.ts",
  "agent-workflow.functions.ts",
  "change-proposal.server.ts",
  "report-workspace.functions.ts",
  "agent-deployment.functions.ts",
  "customer-investigation.functions.ts",
  "agent-detail.server.ts",
  "command-center.server.ts",
  "analytics.functions.ts",
  "live-workspace.functions.ts",
  "investigation.server.ts",
  "users.functions.ts",
  "realtime.ts",
];

describe("workspace environment mode live safety", () => {
  it("has no compile-time demo flag left at any former demo call site", () => {
    for (const file of formerDemoCallSites) {
      const source = readFileSync(resolve(process.cwd(), "src/lib", file), "utf8");
      expect(source, file).not.toContain("DEMO_DATA_ENABLED");
    }
  });

  it("uses the tenant-scoped environment resolver before demo fixture branches", () => {
    for (const file of formerDemoCallSites.filter((name) => name !== "realtime.ts")) {
      const source = readFileSync(resolve(process.cwd(), "src/lib", file), "utf8");
      if (source.includes("DEMO_")) expect(source, file).toContain("resolveTenantContext");
    }
  });
});
