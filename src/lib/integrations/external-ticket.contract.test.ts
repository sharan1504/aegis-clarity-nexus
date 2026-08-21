import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const changeService = readFileSync(new URL("../change-service.ts", import.meta.url), "utf8");
const ticketServer = readFileSync(new URL("./external-ticket.server.ts", import.meta.url), "utf8");

describe("external ticket contract", () => {
  it("does not contain the old fake ticket implementation", () => {
    expect(changeService).not.toContain("Math.random()");
    expect(changeService).not.toContain("jira.example.com");
    expect(changeService).not.toContain("itsm.example.com");
  });

  it("uses tenant-scoped server-side provider credentials and real provider APIs", () => {
    expect(ticketServer).toContain('from("provider_connections")');
    expect(ticketServer).toContain('eq("tenant_id", role.tenant_id)');
    expect(ticketServer).toContain("api.atlassian.com");
    expect(ticketServer).toContain("/api/now/table/change_request");
    expect(ticketServer).toContain("AEGIS_CREDENTIAL_ENCRYPTION_KEY");
  });
});
