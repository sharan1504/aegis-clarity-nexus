import { beforeEach, describe, expect, it, vi } from "vitest";

const tenant = "tenant-fixture";
const user = "user-fixture";

vi.mock("@/lib/genesys/store.server", () => ({
  resolveTenant: vi.fn(async () => ({ tenantId: tenant, roles: ["admin"] })),
}));
vi.mock("@/lib/department-access.server", () => ({
  resolveDepartmentContext: vi.fn(async () => ({ departmentKey: "default", departmentName: "Default", unrestricted: true })),
  getDepartmentProviders: vi.fn(async () => null),
}));
vi.mock("@/lib/evidence-cache.server", () => ({
  clearEvidenceCache: vi.fn(),
  withEvidenceCache: vi.fn(async (_tenant: string, _type: string, _scope: string, loader: () => Promise<unknown>) => loader()),
}));
vi.mock("@/lib/integrations/oauth-jira.server", () => ({
  ensureJiraAccessToken: vi.fn(async () => "jira-token"),
}));
vi.mock("@/lib/integrations/oauth-slack.server", () => ({ ensureSlackAccessToken: vi.fn(async () => "slack-token") }));
vi.mock("@/lib/integrations/oauth-salesforce.server", () => ({ ensureSalesforceAccessToken: vi.fn(), withSalesforceAccessToken: vi.fn() }));
vi.mock("@/lib/integrations/oauth-servicenow.server", () => ({ ensureServiceNowAccessToken: vi.fn() }));
vi.mock("@/lib/integrations/credential-vault.server", () => ({ decryptCredentials: vi.fn(() => ({ accessToken: "fixture-token" })) }));
vi.mock("@/lib/microsoft365/connector.server", () => ({ Microsoft365LicenseConnector: class {} }));
vi.mock("@/lib/integrations/github-connector.server", () => ({ syncGitHub: vi.fn() }));

type Row = Record<string, unknown>;
function client(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder: any = {
        select() { return builder; },
        eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
        in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return builder; },
        order() { return builder; },
        limit() { return builder; },
        update(values: Row) {
          for (const row of tables[table] ?? []) {
            if (filters.every((f) => f(row))) Object.assign(row, values);
          }
          return builder;
        },
        upsert(values: Row) {
          const rows = tables[table] ?? (tables[table] = []);
          const existing = rows.find((row) =>
            row.tenant_id === values.tenant_id &&
            row.provider === values.provider &&
            row.connection_id === values.connection_id &&
            row.entity_type === values.entity_type &&
            row.entity_key === values.entity_key,
          );
          if (existing) Object.assign(existing, values);
          else rows.push({ ...values });
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle: async () => ({ data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row)))[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))), error: null }).then(resolve),
      };
      return builder;
    },
  };
}

describe("provider evidence visibility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists a real Jira sync result and makes it visible to Copilot evidence loading alongside M365", async () => {
    const tables: Record<string, Row[]> = {
      provider_connections: [
        { id: "jira-connection", provider: "jira", status: "connected", display_name: "Jira", last_sync_at: null },
        { id: "m365-connection", provider: "m365", status: "connected", display_name: "Microsoft 365", last_sync_at: null },
      ],
      provider_sync_entities: [],
      github_synced_entities: [],
      provider_sync_runs: [],
    };
    const db = client(tables);

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("accessible-resources")
        ? [{ id: "cloud-1", name: "CenOps Jira" }]
        : url.includes("/project/search")
          ? { values: [{ id: "10001", key: "OPS", name: "Operations", projectTypeKey: "software", self: "https://jira.example/projects/OPS" }] }
          : { issues: [{ id: "20001", key: "OPS-42", fields: { summary: "Production latency", status: { name: "Open" }, issuetype: { name: "Incident" }, project: { key: "OPS" }, assignee: { displayName: "Operator" }, updated: "2026-10-06T09:55:00Z", created: "2026-10-06T09:30:00Z" } }] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const {
      fetchProvider,
      persistProviderSyncRows,
      loadProviderReportData,
    } = await import("./provider-sync.functions");

    const jiraRows = await fetchProvider("jira", { cloudId: "cloud-1" }, "jira-connection", tenant);
    await persistProviderSyncRows(db, tenant, "jira", "jira-connection", "run-jira", jiraRows, "2026-10-06T10:00:00Z");

    await persistProviderSyncRows(db, tenant, "m365", "m365-connection", "run-m365", [{
      entityType: "user",
      entityKey: "m365-user-1",
      payload: { externalId: "m365-user-1", name: "Graph user", status: "active" },
    }], "2026-10-06T10:00:00Z");

    const result = await loadProviderReportData(db, user);
    expect(result.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "jira", entity_key: "20001", entity_type: "issue" }),
      expect.objectContaining({ provider: "m365", entity_key: "m365-user-1", entity_type: "user" }),
    ]));
  });

  it("unifies existing GitHub connector evidence with the generic evidence shape", async () => {
    const db = client({
      provider_connections: [{ id: "github-connection", provider: "github", status: "connected", display_name: "GitHub", last_sync_at: "2026-10-06T10:00:00Z" }],
      provider_sync_entities: [],
      github_synced_entities: [{
        connection_id: "github-connection",
        entity_type: "repository",
        entity_key: "r-1",
        payload: { name: "cenops", pushedAt: "2026-10-06T09:50:00Z" },
        synced_at: "2026-10-06T10:00:00Z",
        stale: false,
      }],
      provider_sync_runs: [],
    });
    const { loadProviderReportData } = await import("./provider-sync.functions");
    const result = await loadProviderReportData(db, user);
    expect(result.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "github", entity_key: "r-1", entity_type: "repository" }),
    ]));
  });
});
