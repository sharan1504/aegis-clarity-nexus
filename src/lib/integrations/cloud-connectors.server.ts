import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

export interface AwsSyncCredentials { roleArn: string; externalId: string; region?: string; }
export interface AzureSyncCredentials { tenant: string; clientId: string; clientSecret: string; }

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${JSON.stringify(body).slice(0, 1200)}`);
  return body;
}

const AWS_REGION = "us-east-1";
const sts = () => new STSClient({ region: AWS_REGION });

async function assumeAwsReadRole(credentials: AwsSyncCredentials, tenantId: string, connectionId: string) {
  const response = await sts().send(new AssumeRoleCommand({
    RoleArn: credentials.roleArn,
    RoleSessionName: `aegis-${tenantId.slice(0, 20)}-${connectionId.slice(0, 20)}`.replace(/[^A-Za-z0-9+=,.@-]/g, "").slice(0, 64),
    ExternalId: credentials.externalId,
    DurationSeconds: 900,
  }));
  const c = response.Credentials;
  if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) throw new Error("AWS AssumeRole did not return complete temporary credentials.");
  const accountId = response.AssumedRoleUser?.Arn?.match(/^arn:[^:]+:sts::(\d{12}):assumed-role\//)?.[1];
  if (!accountId) throw new Error("AWS assumed-role response did not expose a valid account identity.");
  return { accountId, accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.SessionToken, expiration: c.Expiration ?? null };
}

function assumedStsClient(session: Awaited<ReturnType<typeof assumeAwsReadRole>>) {
  return new STSClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: session.accessKeyId,
      secretAccessKey: session.secretAccessKey,
      sessionToken: session.sessionToken,
    },
  });
}

export async function awsHealth(credentials: AwsSyncCredentials, tenantId: string, connectionId: string) {
  const session = await assumeAwsReadRole(credentials, tenantId, connectionId);
  const identity = await assumedStsClient(session).send(new GetCallerIdentityCommand({}));
  if (identity.Account !== session.accountId) throw new Error("AWS caller identity did not match the assumed-role account.");
  return { ok: true, accountId: session.accountId, checkedAt: new Date().toISOString() };
}

export async function syncAwsMinimal(credentials: AwsSyncCredentials, tenantId: string, connectionId: string) {
  const session = await assumeAwsReadRole(credentials, tenantId, connectionId);
  const identity = await assumedStsClient(session).send(new GetCallerIdentityCommand({}));
  if (identity.Account !== session.accountId) throw new Error("AWS sync identity verification failed.");
  const observedAt = new Date().toISOString();
  return {
    rows: [{ entityType: "account", entityKey: session.accountId, payload: { accountId: session.accountId, region: credentials.region ?? "us-east-1" } }],
    observedAt,
  };
}

export async function getAzureAccessToken(credentials: AzureSyncCredentials) {
  const body = await fetchJson(`https://login.microsoftonline.com/${encodeURIComponent(credentials.tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, scope: "https://management.azure.com/.default", grant_type: "client_credentials" }).toString(),
  });
  if (!body.access_token) throw new Error("Azure Entra token response did not include an access token.");
  return String(body.access_token);
}

export async function azureHealth(credentials: AzureSyncCredentials) {
  const token = await getAzureAccessToken(credentials);
  const subscriptions = await fetchJson("https://management.azure.com/subscriptions?api-version=2020-01-01", { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!Array.isArray(subscriptions.value)) throw new Error("Azure subscription response did not contain a value collection.");
  return { ok: true, subscriptionCount: subscriptions.value.length, checkedAt: new Date().toISOString() };
}

export async function syncAzureMinimal(credentials: AzureSyncCredentials) {
  const token = await getAzureAccessToken(credentials);
  const subscriptions = await fetchJson("https://management.azure.com/subscriptions?api-version=2020-01-01", { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  const observedAt = new Date().toISOString();
  const rows = (subscriptions.value ?? []).map((s: any) => ({ entityType: "subscription", entityKey: String(s.subscriptionId), payload: { subscriptionId: s.subscriptionId, displayName: s.displayName, state: s.state, tenantId: credentials.tenant } }));
  return { rows, observedAt };
}
