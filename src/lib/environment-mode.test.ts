import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDemoMode } from "./environment-mode";

describe("environment mode", () => {
  it("only treats demo as demo", () => {
    expect(isDemoMode("demo")).toBe(true);
    expect(isDemoMode("live")).toBe(false);
  });

  it("does not leave the global demo flag in production data paths", () => {
    const paths = [
      "src/lib/realtime.ts",
      "src/lib/change-service.ts",
      "src/lib/users.functions.ts",
      "src/lib/chat-history.functions.ts",
      "src/lib/agent-workflow.functions.ts",
      "src/lib/change-proposal.server.ts",
      "src/lib/report-workspace.functions.ts",
      "src/lib/audit/repository.ts",
      "src/lib/agent-deployment.functions.ts",
      "src/lib/customer-investigation.functions.ts",
      "src/lib/agent-detail.server.ts",
      "src/lib/command-center.server.ts",
      "src/lib/analytics.functions.ts",
      "src/lib/investigation.server.ts",
      "src/lib/live-workspace.functions.ts",
      "src/lib/enterprise-chat.functions.ts",
      "src/routes/_app.chat.tsx",
    ];
    for (const path of paths) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source, path).not.toContain("DEMO_DATA_ENABLED");
    }
    const demoData = readFileSync(resolve(process.cwd(), "src/lib/demo-data.ts"), "utf8");
    expect(demoData).not.toMatch(/DEMO_DATA_ENABLED\s*=\s*true/);
  });
});
