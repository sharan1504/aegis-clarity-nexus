import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface GitHubCredentials { accessToken?: string }
export interface GitHubRemediationRecommendation {
  findingId: string; repositoryName: string | null; title: string | null; severity: string; findingType: string; reason: string; url: string | null;
}
export interface GitHubExecutionResult {
  created: Array<{ findingId: string; repository: string; issueNumber: number; url: string; title: string }>;
  verification: Array<{ findingId: string; issueNumber: number; verified: boolean; url: string }>;
}

function decryptCredentials(value: string): GitHubCredentials {
  const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("Credential encryption is not configured on the server.");
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("GitHub credential ciphertext is malformed.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")) as GitHubCredentials;
}

async function connectionToken(tenantId: string, integrationId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from("provider_connections").select("provider,status,encrypted_credentials").eq("id", integrationId).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw error;
  if (!data || data.provider !== "github") throw new Error("The approved integration is not a GitHub connection for this tenant.");
  if (data.status !== "connected" || !data.encrypted_credentials) throw new Error("The approved GitHub connection is not connected or has no credentials.");
  const token = decryptCredentials(data.encrypted_credentials).accessToken;
  if (!token) throw new Error("The approved GitHub connection has no access token.");
  return token;
}

async function githubJson(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text(); let payload: unknown = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`);
  return payload as Record<string, unknown>;
}

function repositoryParts(repositoryName: string | null): [string, string] {
  if (!repositoryName) throw new Error("The approved security recommendation does not contain a GitHub repository.");
  const parts = repositoryName.split("/").filter(Boolean);
  if (parts.length !== 2) throw new Error(`Invalid GitHub repository name: ${repositoryName}`);
  return [parts[0], parts[1]];
}

export async function executeGitHubRemediation(tenantId: string, integrationId: string, recommendations: GitHubRemediationRecommendation[]): Promise<GitHubExecutionResult> {
  if (recommendations.length === 0) throw new Error("No approved GitHub remediation recommendations are available for execution.");
  if (recommendations.length > 10) throw new Error("GitHub remediation execution is capped at 10 approved findings per run.");
  const token = await connectionToken(tenantId, integrationId); const created: GitHubExecutionResult["created"] = []; const verification: GitHubExecutionResult["verification"] = [];
  for (const recommendation of recommendations) {
    const [owner, repository] = repositoryParts(recommendation.repositoryName);
    const title = `Aegis remediation: ${recommendation.title ?? recommendation.findingId}`;
    const body = ["## Aegis Security Remediation", "", `- Finding: ${recommendation.findingId}`, `- Severity: ${recommendation.severity}`, `- Type: ${recommendation.findingType}`, `- Reason: ${recommendation.reason}`, recommendation.url ? `- Source finding: ${recommendation.url}` : null, "", "This issue was created by Aegis only after the linked change record received the required approval."].filter(Boolean).join("\n");
    const issue = await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`, token, { method: "POST", body: JSON.stringify({ title, body, labels: ["aegis", "security-remediation"] }) });
    const issueNumber = Number(issue.number); const issueUrl = typeof issue.html_url === "string" ? issue.html_url : "";
    if (!Number.isInteger(issueNumber) || !issueUrl) throw new Error("GitHub returned an invalid issue creation response.");
    created.push({ findingId: recommendation.findingId, repository: `${owner}/${repository}`, issueNumber, url: issueUrl, title: typeof issue.title === "string" ? issue.title : title });
    const verified = await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${issueNumber}`, token);
    const verifiedNumber = Number(verified.number); const verifiedUrl = typeof verified.html_url === "string" ? verified.html_url : "";
    if (verifiedNumber !== issueNumber || verifiedUrl !== issueUrl) throw new Error(`GitHub verification failed for issue #${issueNumber} in ${owner}/${repository}.`);
    verification.push({ findingId: recommendation.findingId, issueNumber, verified: true, url: verifiedUrl });
  }
  return { created, verification };
}
