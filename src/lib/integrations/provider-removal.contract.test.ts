import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const providerFunctionsSource = readFileSync(
  fileURLToPath(new URL("./provider-functions.ts", import.meta.url)),
  "utf8",
);

describe("provider integration removal contract", () => {
  it("allows failed/incomplete connections to reach deletion without checking connected status", () => {
    const removalBlock = providerFunctionsSource.slice(providerFunctionsSource.indexOf("export const removeProviderIntegration"));

    expect(removalBlock).toContain('.eq("id", data.connectionId).eq("tenant_id", tenantId).maybeSingle()');
    expect(removalBlock).not.toContain('.eq("status", "connected")');
    expect(removalBlock).toContain('.from("provider_connections").delete()');
    expect(removalBlock).toContain('return { ok: true as const, connectionId: data.connectionId };');
  });

  it("uses the generic integration audit entity and does not require GitHub App auth for removal", () => {
    const removalBlock = providerFunctionsSource.slice(providerFunctionsSource.indexOf("export const removeProviderIntegration"));

    expect(removalBlock).toContain('entity_type: "integration"');
    expect(removalBlock).toContain("auditError");
    expect(removalBlock).not.toContain("installationTokenForCredentials");
    expect(removalBlock).not.toContain("getGitHubAppConfig");
  });

  it("treats missing optional GitHub sync tables as cleanup-only failures", () => {
    const removalBlock = providerFunctionsSource.slice(providerFunctionsSource.indexOf("export const removeProviderIntegration"));

    expect(removalBlock).toContain("github_synced_entities");
    expect(removalBlock).toContain("github_sync_status");
    expect(removalBlock).toContain("relation .* does not exist");
    expect(removalBlock).toContain("could not find the table");
  });
});
