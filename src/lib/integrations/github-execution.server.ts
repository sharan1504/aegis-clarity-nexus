export interface GitHubRemediationIssueInput {
  token: string;
  owner: string;
  repository: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface GitHubRemediationIssueResult {
  issueNumber: number;
  url: string;
  title: string;
}

/** First real GitHub write capability for Aegis. */
export async function createGitHubRemediationIssue(input: GitHubRemediationIssueInput): Promise<GitHubRemediationIssueResult> {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${input.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: input.title, body: input.body, ...(input.labels?.length ? { labels: input.labels } : {}) }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`GitHub issue creation failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }

  const payload = (await response.json()) as { number?: number; html_url?: string; title?: string };
  if (!Number.isInteger(payload.number) || typeof payload.html_url !== "string") throw new Error("GitHub issue creation returned an invalid response.");
  return { issueNumber: payload.number, url: payload.html_url, title: payload.title ?? input.title };
}

export async function verifyGitHubRemediationIssue(token: string, owner: string, repository: string, issueNumber: number): Promise<GitHubRemediationIssueResult> {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/issues/${issueNumber}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GitHub issue verification failed (${response.status}).`);
  const payload = (await response.json()) as { number?: number; html_url?: string; title?: string };
  if (payload.number !== issueNumber || typeof payload.html_url !== "string") throw new Error("GitHub issue verification returned an unexpected issue.");
  return { issueNumber, url: payload.html_url, title: payload.title ?? "" };
}
