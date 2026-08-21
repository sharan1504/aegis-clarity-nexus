// Server-only Microsoft 365 / Microsoft Graph connector.
// READ ONLY: this connector never changes users or licenses.
//
// Authentication model: customer Entra tenant + app registration using the
// OAuth 2.0 client-credentials flow. The customer must grant admin consent to
// LicenseAssignment.Read.All and User.Read.All. Secrets are never sent to the
// browser or the LLM. For multi-tenant SaaS, store these credentials in the
// server-side integration secret store and pass them to this connector.

import type { AegisAssignment, AegisConnector, AegisLicense, AegisSnapshotMetadata, AegisUser } from "@/lib/core";

export interface Microsoft365Connection {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

interface GraphUser {
  id: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  accountEnabled?: boolean | null;
  assignedLicenses?: Array<{ skuId?: string; disabledPlans?: string[] }>;
}

interface GraphSku {
  skuId: string;
  skuPartNumber?: string | null;
  consumedUnits?: number | null;
  prepaidUnits?: { enabled?: number | null; suspended?: number | null; warning?: number | null } | null;
  capabilityStatus?: string | null;
  servicePlans?: Array<{ servicePlanId?: string; servicePlanName?: string; capabilityStatus?: string }>;
}

interface GraphPage<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const TOKEN_ROOT = "https://login.microsoftonline.com";
const CLIENT_SCOPE = "https://graph.microsoft.com/.default";

function requireConnection(connection: Microsoft365Connection): Microsoft365Connection {
  if (!connection.tenantId || !connection.clientId || !connection.clientSecret) {
    throw new Error("Microsoft 365 connector is not configured. Provide tenantId, clientId and clientSecret server-side.");
  }
  return connection;
}

async function getAccessToken(connection: Microsoft365Connection): Promise<string> {
  const c = requireConnection(connection);
  const response = await fetch(`${TOKEN_ROOT}/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: CLIENT_SCOPE,
      grant_type: "client_credentials",
    }).toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Microsoft Entra token request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const body = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Microsoft Entra did not return an access token.");
  return body.access_token;
}

async function graphGet<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 401) throw new Error("Microsoft Graph authentication failed or the token expired.");
    if (response.status === 403) throw new Error(`Microsoft Graph permission denied: ${text.slice(0, 300)}`);
    if (response.status === 429) throw new Error("Microsoft Graph rate limit reached; retry the sync with backoff.");
    throw new Error(`Microsoft Graph request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

async function listAll<T>(url: string, accessToken: string, maxPages = 1000): Promise<T[]> {
  const result: T[] = [];
  let next: string | undefined = url;
  let pages = 0;
  while (next && pages < maxPages) {
    const page: GraphPage<T> = await graphGet<GraphPage<T>>(next, accessToken);
    result.push(...(page.value ?? []));
    next = page["@odata.nextLink"];
    pages += 1;
  }
  if (next) throw new Error(`Microsoft Graph pagination exceeded the configured page limit (${maxPages}).`);
  return result;
}

export class Microsoft365LicenseConnector implements AegisConnector {
  readonly key = "microsoft365";
  readonly displayName = "Microsoft 365 / Entra ID";

  constructor(private readonly connection: Microsoft365Connection) {}

  async discover() {
    return { users: true, licenses: true, assignments: true, usage: false };
  }

  async sync() {
    const token = await getAccessToken(this.connection);
    const [usersRaw, skusRaw] = await Promise.all([
      listAll<GraphUser>(`${GRAPH_ROOT}/users?$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses&$top=999`, token),
      listAll<GraphSku>(`${GRAPH_ROOT}/subscribedSkus?$select=skuId,skuPartNumber,consumedUnits,prepaidUnits,capabilityStatus,servicePlans`, token),
    ]);

    const tenantId = this.connection.tenantId;
    const skuMap = new Map(skusRaw.map((sku) => [sku.skuId, sku]));
    const syncedAt = new Date().toISOString();

    const users: AegisUser[] = usersRaw.map((user) => ({
      tenantId,
      externalId: user.id,
      name: user.displayName ?? null,
      email: user.mail ?? user.userPrincipalName ?? null,
      status: user.accountEnabled === false ? "disabled" : "active",
      metadata: { userPrincipalName: user.userPrincipalName ?? null, source: "microsoft_graph" },
    }));

    const licenses: AegisLicense[] = skusRaw.map((sku) => ({
      tenantId,
      externalId: sku.skuId,
      name: sku.skuPartNumber ?? sku.skuId,
      status: sku.capabilityStatus ?? "Enabled",
      metadata: {
        consumedUnits: sku.consumedUnits ?? 0,
        prepaidUnits: sku.prepaidUnits ?? null,
        servicePlans: sku.servicePlans ?? [],
        source: "microsoft_graph",
      },
    }));

    const assignments: AegisAssignment[] = [];
    for (const user of usersRaw) {
      for (const assigned of user.assignedLicenses ?? []) {
        if (!assigned.skuId || !skuMap.has(assigned.skuId)) continue;
        assignments.push({
          tenantId,
          userExternalId: user.id,
          licenseExternalId: assigned.skuId,
          status: "assigned",
          metadata: {
            disabledPlans: assigned.disabledPlans ?? [],
            source: "microsoft_graph",
          },
        });
      }
    }

    const dataVersion = await fingerprint({
      users: users.map((u) => [u.externalId, u.status]),
      licenses: licenses.map((l) => [l.externalId, l.status, l.metadata?.consumedUnits]),
      assignments: assignments.map((a) => [a.userExternalId, a.licenseExternalId]),
    });

    const snapshot: AegisSnapshotMetadata = {
      tenantId,
      connector: this.key,
      dataVersion,
      syncedAt,
      lastSuccessfulSyncAt: syncedAt,
      recordCount: users.length + licenses.length + assignments.length,
      freshness: "fresh",
    };

    return { users, licenses, assignments, snapshot };
  }

  async health() {
    try {
      const token = await getAccessToken(this.connection);
      await graphGet<{ id?: string }>(`${GRAPH_ROOT}/organization?$select=id`, token);
      return { ok: true, message: "Microsoft Graph authentication and read access are healthy." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Microsoft 365 health check failed." };
    }
  }
}

async function fingerprint(value: unknown): Promise<string> {
  const serialized = JSON.stringify(value);
  const bytes = new TextEncoder().encode(serialized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getMicrosoft365ConnectionFromEnvironment(): Microsoft365Connection {
  const tenantId = process.env["MICROSOFT_TENANT_ID"];
  const clientId = process.env["MICROSOFT_CLIENT_ID"];
  const clientSecret = process.env["MICROSOFT_CLIENT_SECRET"];
  if (!tenantId || !clientId || !clientSecret) throw new Error("Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET as server-side secrets.");
  return { tenantId, clientId, clientSecret };
}
