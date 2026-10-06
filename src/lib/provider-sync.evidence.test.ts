import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ connections: [] as any[], generic: [] as any[], github: [] as any[], runs: [] as any[] }));

vi.mock("@/lib/genesys/store.server", () => ({ resolveTenant: vi.fn(async () => ({ tenantId: "tenant-1" })) }));
vi.mock("@/lib/department-access.server", () => ({
  resolveDepartmentContext: vi.fn(async () => ({ departmentKey: "default", departmentName: "Default", unrestricted: true })),
  getDepartmentProviders: vi.fn(async () => null),
}));
vi.mock("@/lib/evidence-cache.server", () => ({ clearEvidenceCache: vi.fn(), withEvidenceCache: vi.fn(async (_tenant: string, _kind: string, _scope: string, fn: () => Promise<any>) => fn()) }));
vi.mock("@/lib/operational-issues.server", () => ({ recordOperationalIssueSafely: vi.fn() }));
vi.mock("@/lib/integrations/credential-vault.server", () => ({ decryptCredentials: vi.fn() }));
vi.mock("@/lib/integrations/github-connector.server", () => ({ syncGitHub: vi.fn() }));
vi.mock("@/lib/integrations/oauth-jira.server", () => ({ ensureJiraAccessToken: vi.fn() }));
vi.mock("@/lib/integrations/oauth-salesforce.server", () => ({ ensureSalesforceAccessToken: vi.fn(), withSalesforceAccessToken: vi.fn() }));
vi.mock("@/lib/integrations/oauth-servicenow.server", () => ({ ensureServiceNowAccessToken: vi.fn() }));
vi.mock("@/lib/integrations/oauth-slack.server", () => ({ ensureSlackAccessToken: vi.fn() }));
vi.mock("@/lib/microsoft365/connector.server", () => ({ Microsoft365LicenseConnector: vi.fn() }));

function client() {
  return {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (value: any) => any) => Promise.resolve({
          data: table === "provider_connections" ? state.connections : table === "provider_sync_entities" ? state.generic : table === "github_synced_entities" ? state.github : state.runs,
          error: null,
        }).then(resolve),
      };
      return chain;
    },
  };
}

beforeEach(() => {
  state.connections = [
    { id: "jira-1", provider: "jira", status: "connected", display_name: "Jira", last_sync_at: "2026-10-06T10:00:00Z" },
    { id: "m365-1", provider: "m365", status: "connected", display_name: "Microsoft 365", last_sync_at: "2026-10-06T10:00:00Z" },
    { id: "github-1", provider: "github", status: "connected", display_name: "GitHub", last_sync_at: "2026-10-06T10:00:00Z" },
  ];
  state.generic = [
    { provider: "jira", connection_id: "jira-1", entity_type: "issue", entity_key: "JRA-42", payload: { key: "JRA-42", summary: "Real Jira issue" }, observed_at: "2026-10-06T10:00:00Z" },
    { provider: "m365", connection_id: "m365-1", entity_type: "user", entity_key: "user-1", payload: { name: "Real M365 user" }, observed_at: "2026-10-06T10:00:00Z" },
  ];
  state.github = [{ connection_id: "github-1", entity_type: "repository", entity_key: "repo-1", payload: { name: "real-repo" }, synced_at: "2026-10-06T10:00:00Z" }];
  state.runs = [];
});

describe("provider evidence regression", () => {
  it("loads persisted Jira and Microsoft 365 evidence for the connected tenant", async () => {
    const { loadProviderReportData } = await import("./provider-sync.functions");
    const result = await loadProviderReportData(client(), "user-1", "default");
    expect(result.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "jira", entity_key: "JRA-42" }),
      expect.objectContaining({ provider: "m365", entity_key: "user-1" }),
    ]));
  });

  it("also exposes GitHub connector evidence without fabricating a generic row", async () => {
    const { loadProviderReportData } = await import("./provider-sync.functions");
    const result = await loadProviderReportData(client(), "user-1", "default");
    expect(result.entities).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "github", entity_key: "repo-1" })]));
  });
});
