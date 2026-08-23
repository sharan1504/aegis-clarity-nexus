import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExternalTicket } from "@/lib/change-data";

type TicketSystem = "Jira" | "ServiceNow";

interface StoredCredentials {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
  apiToken?: string;
  tenant?: string;
}

function decryptCredentials(value: string): StoredCredentials {
  const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("AEGIS_CREDENTIAL_ENCRYPTION_KEY is not configured on the server.");
  }
  const [ivText, tagText, ciphertextText] = value.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Stored provider credentials are invalid.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as StoredCredentials;
}

async function requestJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const detail = typeof body === "object" ? JSON.stringify(body) : String(body);
    throw new Error(`Provider request failed (${response.status}): ${detail}`);
  }
  return body as Record<string, unknown>;
}

async function createJiraTicket(credentials: StoredCredentials, record: { id: string; title: string; aiReasoning: string; severity: string }) {
  const accessToken = credentials.accessToken;
  if (!accessToken) throw new Error("Jira is connected without an OAuth access token.");

  let siteUrl = credentials.baseUrl?.replace(/\/$/, "");
  let cloudId: string | undefined;
  const sites = await requestJson("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (Array.isArray(sites)) {
    const site = sites[0] as Record<string, unknown> | undefined;
    cloudId = String(site?.id ?? "") || undefined;
    siteUrl = siteUrl || String(site?.url ?? "").replace(/\/$/, "") || undefined;
  }
  if (!cloudId) throw new Error("Jira returned no accessible site for this connection.");

  const projectResponse = await requestJson(`https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3/project/search?maxResults=1`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  const project = Array.isArray(projectResponse.values)
    ? projectResponse.values[0] as Record<string, unknown> | undefined
    : undefined;
  const projectKey = String(project?.key ?? "");
  if (!projectKey) throw new Error("Jira connection has no accessible project. Connect a Jira account with at least one project.");

  const created = await requestJson(`https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary: `[Aegis] ${record.title}`,
        issuetype: { name: "Task" },
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: `Aegis change ${record.id} (${record.severity}).` }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: record.aiReasoning.slice(0, 4000) }],
            },
          ],
        },
      },
    }),
  });
  const key = String(created.key ?? "");
  const id = String(created.id ?? key);
  if (!key) throw new Error("Jira created the issue but returned no issue key.");
  return {
    system: "Jira" as const,
    id: key,
    url: siteUrl ? `${siteUrl}/browse/${encodeURIComponent(key)}` : `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/browse/${encodeURIComponent(key)}`,
  } satisfies ExternalTicket;
}

async function createServiceNowTicket(credentials: StoredCredentials, record: { id: string; title: string; aiReasoning: string; severity: string }) {
  const accessToken = credentials.accessToken;
  const baseUrl = credentials.baseUrl?.replace(/\/$/, "");
  if (!accessToken) throw new Error("ServiceNow is connected without an OAuth access token.");
  if (!baseUrl) throw new Error("ServiceNow connection is missing its instance URL.");

  const created = await requestJson(`${baseUrl}/api/now/table/change_request`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      short_description: `[Aegis] ${record.title}`,
      description: `Aegis change ${record.id}\nSeverity: ${record.severity}\n\n${record.aiReasoning}`.slice(0, 8000),
    }),
  });
  const result = (created.result ?? {}) as Record<string, unknown>;
  const sysId = String(result.sys_id ?? "");
  const number = String(result.number ?? "");
  if (!sysId && !number) throw new Error("ServiceNow created the change but returned no change number or sys_id.");
  return {
    system: "ServiceNow" as const,
    id: number || sysId,
    url: `${baseUrl}/nav_to.do?uri=change_request.do?sys_id=${encodeURIComponent(sysId)}`,
  } satisfies ExternalTicket;
}

export const createExternalTicketServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { changeRecordId: string; system: TicketSystem }) => ({
    changeRecordId: String(input.changeRecordId ?? "").trim(),
    system: input.system,
  }))
  .handler(async ({ data, context }) => {
    if (!data.changeRecordId) throw new Error("Change record ID is required.");
    if (data.system !== "Jira" && data.system !== "ServiceNow") throw new Error("Unsupported ticket system.");

    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles")
      .select("tenant_id,role")
      .eq("user_id", context.userId);
    if (roleError) throw roleError;
    const role = roleRows?.find((row) => row.role === "admin" || row.role === "manager");
    if (!role?.tenant_id) throw new Error("Admin/manager access is required to create external tickets.");

    const { data: record, error: recordError } = await context.supabase
      .from("change_records")
      .select("id,change_id,title,ai_reasoning,severity,tenant_id")
      .eq("id", data.changeRecordId)
      .eq("tenant_id", role.tenant_id)
      .maybeSingle();
    if (recordError) throw recordError;
    if (!record) throw new Error("Change record not found in your workspace.");

    const provider = data.system === "Jira" ? "jira" : "servicenow";
    const { data: connection, error: connectionError } = await context.supabase
      .from("provider_connections")
      .select("encrypted_credentials,status")
      .eq("tenant_id", role.tenant_id)
      .eq("provider", provider)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.status !== "connected" || !connection.encrypted_credentials) {
      throw new Error(`${data.system} is not connected for this workspace.`);
    }

    const credentials = decryptCredentials(connection.encrypted_credentials);
    const ticketRecord = { id: record.change_id, title: record.title, aiReasoning: record.ai_reasoning ?? "", severity: record.severity };
    const ticket = data.system === "Jira"
      ? await createJiraTicket(credentials, ticketRecord)
      : await createServiceNowTicket(credentials, ticketRecord);

    const existing = await context.supabase
      .from("change_records")
      .select("external_tickets,timeline")
      .eq("id", record.id)
      .eq("tenant_id", role.tenant_id)
      .single();
    if (existing.error) throw existing.error;

    const now = new Date().toISOString();
    const externalTickets = Array.isArray(existing.data.external_tickets) ? existing.data.external_tickets : [];
    const timeline = Array.isArray(existing.data.timeline) ? existing.data.timeline : [];
    externalTickets.push(ticket);
    timeline.unshift({
      ts: now,
      actor: (context.claims as { email?: string } | undefined)?.email ?? context.userId,
      kind: "system",
      text: `${data.system} ticket ${ticket.id} created and linked.`,
    });

    const { error: updateError } = await context.supabase
      .from("change_records")
      .update({ external_tickets: externalTickets, timeline })
      .eq("id", record.id)
      .eq("tenant_id", role.tenant_id);
    if (updateError) throw updateError;

    return ticket;
  });
