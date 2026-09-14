import crypto from "node:crypto";

type StoredCredentials = {
  accessToken?: string;
  refreshToken?: string;
  apiToken?: string;
  baseUrl?: string;
  tenant?: string;
  clientId?: string;
  clientSecret?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
};

export type ConnectorProvider = "aws" | "azure" | "m365" | "jira" | "servicenow" | "salesforce" | "slack";
export type ConnectorEntity = { entityType: string; entityKey: string; payload: Record<string, unknown> };

export function decryptProviderCredentials(value: string): StoredCredentials {
  const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("Credential encryption is not configured on the server.");
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Stored provider credentials are invalid.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")) as StoredCredentials;
}

async function requestJson<T = Record<string, unknown>>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const detail = typeof body === "object" ? JSON.stringify(body) : String(body);
    throw new Error(`Provider request failed (${response.status}): ${detail.slice(0, 1600)}`);
  }
  return body as T;
}

function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { accept: "application/json", authorization: `Bearer ${token}`, ...extra };
}

function required(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function row(entityType: string, entityKey: string | number, payload: Record<string, unknown>): ConnectorEntity {
  return { entityType, entityKey: String(entityKey), payload };
}

async function connectMicrosoft(token: string, provider: "azure" | "m365") {
  if (provider === "azure") {
    const subscriptions = await requestJson<{ value?: Array<Record<string, unknown>> }>("https://management.azure.com/subscriptions?api-version=2020-01-01", { headers: bearer(token) });
    return {
      externalId: String(subscriptions.value?.[0]?.subscriptionId ?? "azure"),
      displayName: String(subscriptions.value?.[0]?.displayName ?? "Microsoft Azure"),
    };
  }
  const org = await requestJson<{ value?: Array<Record<string, unknown>> }>("https://graph.microsoft.com/v1.0/organization?$select=id,displayName", { headers: bearer(token) });
  return {
    externalId: String(org.value?.[0]?.id ?? "m365"),
    displayName: String(org.value?.[0]?.displayName ?? "Microsoft 365"),
  };
}

async function syncM365(credentials: StoredCredentials): Promise<ConnectorEntity[]> {
  const token = required(credentials.accessToken, "Microsoft 365 access token");
  const [users, groups, skus] = await Promise.all([
    requestJson<{ value?: Array<Record<string, unknown>> }>("https://graph.microsoft.com/v1.0/users?$top=100&$select=id,displayName,userPrincipalName,accountEnabled", { headers: bearer(token) }),
    requestJson<{ value?: Array<Record<string, unknown>> }>("https://graph.microsoft.com/v1.0/groups?$top=100&$select=id,displayName,mail,securityEnabled,groupTypes", { headers: bearer(token) }),
    requestJson<{ value?: Array<Record<string, unknown>> }>("https://graph.microsoft.com/v1.0/subscribedSkus?$select=skuId,skuPartNumber,consumedUnits,prepaidUnits", { headers: bearer(token) }),
  ]);
  return [
    ...(users.value ?? []).map((u) => row("user", String(u.id), { displayName: u.displayName, userPrincipalName: u.userPrincipalName, accountEnabled: u.accountEnabled })),
    ...(groups.value ?? []).map((g) => row("group", String(g.id), { displayName: g.displayName, mail: g.mail, securityEnabled: g.securityEnabled, groupTypes: g.groupTypes })),
    ...(skus.value ?? []).map((s) => row("license", String(s.skuId), { skuPartNumber: s.skuPartNumber, consumedUnits: s.consumedUnits, prepaidUnits: s.prepaidUnits })),
  ];
}

async function syncAzure(credentials: StoredCredentials): Promise<ConnectorEntity[]> {
  const token = required(credentials.accessToken, "Azure access token");
  const subscriptions = await requestJson<{ value?: Array<Record<string, unknown>> }>("https://management.azure.com/subscriptions?api-version=2020-01-01", { headers: bearer(token) });
  const result: ConnectorEntity[] = (subscriptions.value ?? []).map((s) => row("subscription", String(s.subscriptionId), { displayName: s.displayName, state: s.state, tenantId: s.tenantId }));
  await Promise.all((subscriptions.value ?? []).slice(0, 20).map(async (s) => {
    const subscriptionId = String(s.subscriptionId ?? "");
    if (!subscriptionId) return;
    try {
      const resources = await requestJson<{ data?: Array<Record<string, unknown>> }>("https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01", {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ subscriptions: [subscriptionId], query: "Resources | project id,name,type,location,resourceGroup | limit 200" }),
      });
      for (const resource of resources.data ?? []) result.push(row("resource", String(resource.id), { name: resource.name, type: resource.type, location: resource.location, resourceGroup: resource.resourceGroup, subscriptionId }));
    } catch (error) {
      if (error instanceof Error && /403|401/.test(error.message)) return;
      throw error;
    }
  }));
  return result;
}

function awsSigningKey(secret: string, date: string, region: string, service: string) {
  const h = (key: Buffer | string, value: string) => crypto.createHmac("sha256", key).update(value, "utf8").digest();
  return h(h(h(h(`AWS4${secret}`, date), region), service), "aws4_request");
}

async function awsQuery(credentials: StoredCredentials, service: string, region: string, host: string, target: string, params: Record<string, string>) {
  const accessKeyId = required(credentials.accessKeyId, "AWS access key ID");
  const secretAccessKey = required(credentials.secretAccessKey, "AWS secret access key");
  const sessionToken = credentials.sessionToken?.trim();
  const body = new URLSearchParams({ ...params, Version: service === "sts" ? "2011-06-15" : service === "ec2" ? "2016-11-15" : "2010-05-08" }).toString();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash("sha256").update(body).digest("hex");
  const canonicalHeaders = `content-type:application/x-www-form-urlencoded; charset=utf-8\nhost:${host}\nx-amz-date:${amzDate}\n${sessionToken ? `x-amz-security-token:${sessionToken}\n` : ""}`;
  const signedHeaders = `content-type;host;x-amz-date${sessionToken ? ";x-amz-security-token" : ""}`;
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, crypto.createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const signature = crypto.createHmac("sha256", awsSigningKey(secretAccessKey, dateStamp, region, service)).update(stringToSign, "utf8").digest("hex");
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    host,
    "x-amz-date": amzDate,
    "x-amz-target": target,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;
  const endpoint = `https://${host}/`;
  const response = await fetch(endpoint, { method: "POST", headers, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`AWS ${service} request failed (${response.status}): ${text.slice(0, 1200)}`);
  return text;
}

async function syncAws(credentials: StoredCredentials): Promise<ConnectorEntity[]> {
  const region = required(credentials.region, "AWS region");
  const caller = await awsQuery(credentials, "sts", region, `sts.${region}.amazonaws.com`, "", { Action: "GetCallerIdentity" });
  const account = caller.match(/<Account>([^<]+)<\/Account>/)?.[1];
  const arn = caller.match(/<Arn>([^<]+)<\/Arn>/)?.[1];
  if (!account) throw new Error("AWS STS authenticated but returned no account ID.");
  const result: ConnectorEntity[] = [row("account", account, { accountId: account, arn, region })];
  try {
    const ec2 = await awsQuery(credentials, "ec2", region, `ec2.${region}.amazonaws.com`, "AmazonEC2.DescribeInstances", { Action: "DescribeInstances" });
    for (const match of ec2.matchAll(/<instanceId>([^<]+)<\/instanceId>/g)) result.push(row("instance", match[1], { instanceId: match[1], region, accountId: account }));
  } catch { /* EC2 permissions are optional; STS identity remains the authoritative connection check. */ }
  try {
    const iam = await awsQuery(credentials, "iam", "us-east-1", "iam.amazonaws.com", "", { Action: "GetAccountSummary" });
    const users = iam.match(/<Users>(\d+)<\/Users>/)?.[1];
    const roles = iam.match(/<Roles>(\d+)<\/Roles>/)?.[1];
    result.push(row("iam_summary", account, { users: users ? Number(users) : null, roles: roles ? Number(roles) : null, accountId: account }));
  } catch { /* IAM permissions are optional. */ }
  return result;
}

async function syncJira(credentials: StoredCredentials): Promise<ConnectorEntity[]> {
  const token = required(credentials.accessToken, "Jira OAuth access token");
  const sites = await requestJson<Array<Record<string, unknown>>>("https://api.atlassian.com/oauth/token/accessible-resources", { headers: bearer(token) });
  const site = sites[0];
  const cloudId = String(site?.id ?? "");
  if (!cloudId) throw new Error("Jira returned no accessible site.");
  const base = `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}`;
  const projects = await requestJson<{ values?: Array<Record<string, unknown>> }>(`${base}/rest/api/3/project/search?maxResults=100`, { headers: bearer(token) });
  const issues = await requestJson<{ issues?: Array<Record<string, unknown>> }>(`${base}/rest/api/3/search/jql`, {
    method: "POST",
    headers: { ...bearer(token), "content-type": "application/json" },
    body: JSON.stringify({ jql: "updated >= -30d ORDER BY updated DESC", maxResults: 100, fields: ["summary", "status", "issuetype", "project", "assignee", "updated", "created"] }),
  });
  return [
    row("site", cloudId, { name: site?.name, url: site?.url, scopes: site?.scopes }),
    ...(projects.values ?? []).map((p) => row("project", String(p.id), { key: p.key, name: p.name, projectType: p.projectTypeKey, url: p.self })),
    ...(issues.issues ?? []).map((i) => { const f = (i.fields ?? {}) as Record<string, any>; return row("issue", String(i.id), { key: i.key, summary: f.summary, status: f.status?.name, issueType: f.issuetype?.name, project: f.project?.key, assignee: f.assignee?.displayName ?? null, updated: f.updated, created: f.created }); }),
  ];
}

async function syncServiceNow(credentials: StoredCredentials): Promise<ConnectorEntity[]> {
  const token = required(credentials.accessToken, "ServiceNow OAuth access token");
  const baseUrl = required(credentials.baseUrl, "ServiceNow instance URL").replace(/\/$/, "");
  const headers = bearer(token, { accept: "application/json" });
  const [incidents, changes, cis] = await Promise.all([
    requestJson<{ result?: Array<Record<string, unknown>> }>(`${baseUrl}/api/now/table/incident?sysparm_limit=100&sysparm_fields=sys_id,number,short_description,state,priority,assignment_group,opened_at,sys_updated_on`, { headers }),
    requestJson<{ result?: Array<Record<string, unknown>> }>(`${baseUrl}/api/now/table/change_request?sysparm_limit=100&sysparm_fields=sys_id,number,short_description,state,priority,assignment_group,start_date,end_date,sys_updated_on`, { headers }),
    requestJson<{ result?: Array<Record<string, unknown>> }>(`${baseUrl}/api/now/table/cmdb_ci?sysparm_limit=100&sysparm_fields=sys_id,name,sys_class_name,operational_status,install_status,sys_updated_on`, { headers }),
  ]);
  return [
    ...(incidents.result ?? []).map((x) => row("incident", String(x.sys_id ?? x.number), { number: x.number, shortDescription: x.short_description, state: x.state, priority: x.priority, assignmentGroup: x.assignment_group, openedAt: x.opened_at, updatedAt: x.sys_updated_on })),
    ...(changes.result ?? []).map((x) => row("change", String(x.sys_id ?? x.number), { number: x.number, shortDescription: x.short_description, state: x.state, priority: x.priority, assignmentGroup: x.assignment_group, startDate: x.start_date, endDate: x.end_date, updatedAt: x.sys_updated_on })),
    ...(cis.result ?? []).map((x) => row("configuration_item", String(x.sys_id ?? x.name), { name: x.name, className: x.sys_class_name, operationalStatus: x.operational_status, installStatus: x.install_status, updatedAt: x.sys_updated_on })),
  ];
}

async function salesforceApi(credentials: StoredCredentials, path: string) {
  const token = required(credentials.accessToken, "Salesforce OAuth access token");
  const base = required(credentials.baseUrl, "Salesforce instance URL").replace(/\/$/, "");
  return requestJson<any>(`${base}${path}`, { headers: bearer(token) });
}

async function salesforceApiVersion(credentials: StoredCredentials): Promise<string> {
  const token = required(credentials.accessToken, "Salesforce OAuth access token");
  const base = required(credentials.baseUrl, "Salesforce instance URL").replace(/\/$/, "");
  const versions = await requestJson<Array<{ version?: string }>>(`${base}/services/data/`, { headers: bearer(token) });
  const available = versions.map((v) => v.version).filter((v): v is string => typeof v === "string");
  if (!available.length) throw new Error("Salesforce returned no REST API versions.");
  return available.sort((a, b) => Number.parseFloat(b.slice(1)) - Number.parseFloat(a.slice(1)))[0];
}

async function syncSalesforce(credentials: StoredCredentials): Promise<ConnectorEntity[]> {
  const version = await salesforceApiVersion(credentials);
  const soql = [
    ["Account", "SELECT Id,Name,Industry,Type,LastModifiedDate FROM Account ORDER BY LastModifiedDate DESC LIMIT 100"],
    ["Case", "SELECT Id,CaseNumber,Subject,Status,Priority,LastModifiedDate FROM Case ORDER BY LastModifiedDate DESC LIMIT 100"],
    ["Opportunity", "SELECT Id,Name,StageName,Amount,CloseDate,LastModifiedDate FROM Opportunity ORDER BY LastModifiedDate DESC LIMIT 100"],
  ] as const;
  const rows: ConnectorEntity[] = [];
  for (const [entityType, query] of soql) {
    const encoded = encodeURIComponent(query);
    const data = await salesforceApi(credentials, `/services/data/${version}/query?q=${encoded}`);
    for (const record of (data.records ?? []) as Array<Record<string, unknown>>) rows.push(row(entityType.toLowerCase(), String(record.Id), record));
  }
  return rows;
}

async function syncSlack(credentials: StoredCredentials): Promise<ConnectorEntity[]> {
  const token = required(credentials.accessToken, "Slack OAuth access token");
  const auth = await requestJson<any>("https://slack.com/api/auth.test", { headers: bearer(token) });
  if (auth.ok !== true) throw new Error(String(auth.error ?? "Slack authentication failed."));
  const [team, channels, users] = await Promise.all([
    requestJson<any>("https://slack.com/api/team.info", { headers: bearer(token) }),
    requestJson<any>("https://slack.com/api/conversations.list?limit=200&exclude_archived=true", { headers: bearer(token) }),
    requestJson<any>("https://slack.com/api/users.list?limit=200", { headers: bearer(token) }),
  ]);
  if (channels.ok !== true) throw new Error(String(channels.error ?? "Slack channel discovery failed."));
  if (users.ok !== true) throw new Error(String(users.error ?? "Slack user discovery failed."));
  return [
    row("workspace", String(auth.team_id), { team: auth.team, teamId: auth.team_id, userId: auth.user_id, url: team.team?.domain ? `https://${team.team.domain}.slack.com` : null }),
    ...((channels.channels ?? []) as Array<Record<string, unknown>>).map((c) => row("channel", String(c.id), { name: c.name, isPrivate: c.is_private, isShared: c.is_shared, memberCount: c.num_members, topic: (c.topic as any)?.value ?? "", purpose: (c.purpose as any)?.value ?? "" })),
    ...((users.members ?? []) as Array<Record<string, unknown>>).map((u) => row("user", String(u.id), { name: u.name, realName: u.real_name, displayName: (u.profile as any)?.display_name ?? null, email: (u.profile as any)?.email ?? null, deleted: u.deleted, isBot: u.is_bot })),
  ];
}

export async function healthCheckPlatform(provider: ConnectorProvider, credentials: StoredCredentials) {
  switch (provider) {
    case "aws": {
      const rows = await syncAws(credentials);
      return { ok: true, externalId: rows.find((x) => x.entityType === "account")?.entityKey ?? "aws", displayName: "AWS", recordsVisible: rows.length };
    }
    case "azure": {
      const identity = await connectMicrosoft(required(credentials.accessToken, "Azure access token"), provider);
      return { ok: true, ...identity, recordsVisible: (await syncAzure(credentials)).length };
    }
    case "m365": {
      const identity = await connectMicrosoft(required(credentials.accessToken, "Microsoft 365 access token"), provider);
      return { ok: true, ...identity, recordsVisible: (await syncM365(credentials)).length };
    }
    case "jira": {
      const rows = await syncJira(credentials);
      return { ok: true, externalId: rows[0]?.entityKey ?? "jira", displayName: String(rows[0]?.payload.name ?? "Jira"), recordsVisible: rows.length };
    }
    case "servicenow": {
      const rows = await syncServiceNow(credentials);
      return { ok: true, externalId: required(credentials.baseUrl, "ServiceNow instance URL"), displayName: required(credentials.baseUrl, "ServiceNow instance URL"), recordsVisible: rows.length };
    }
    case "salesforce": {
      const version = await salesforceApiVersion(credentials);
      const org = await salesforceApi(credentials, `/services/data/${version}/connect/organization`);
      return { ok: true, externalId: String(org.id ?? "salesforce"), displayName: String(org.organizationName ?? "Salesforce"), recordsVisible: 1 };
    }
    case "slack": {
      const token = required(credentials.accessToken, "Slack OAuth access token");
      const auth = await requestJson<any>("https://slack.com/api/auth.test", { headers: bearer(token) });
      if (auth.ok !== true) throw new Error(String(auth.error ?? "Slack authentication failed."));
      return { ok: true, externalId: String(auth.team_id ?? "slack"), displayName: String(auth.team ?? "Slack workspace"), recordsVisible: 1 };
    }
  }
}

export async function fetchPlatformEntities(provider: ConnectorProvider, credentials: StoredCredentials): Promise<ConnectorEntity[]> {
  switch (provider) {
    case "aws": return syncAws(credentials);
    case "azure": return syncAzure(credentials);
    case "m365": return syncM365(credentials);
    case "jira": return syncJira(credentials);
    case "servicenow": return syncServiceNow(credentials);
    case "salesforce": return syncSalesforce(credentials);
    case "slack": return syncSlack(credentials);
  }
}
