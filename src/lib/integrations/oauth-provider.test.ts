import { describe, expect, it } from "vitest";
import { buildJiraAuthorizeUrl, JIRA_SCOPES } from "./oauth-jira.server";
import { buildSalesforceAuthorizeUrl, SALESFORCE_SCOPES } from "./oauth-salesforce.server";
import { buildServiceNowAuthorizeUrl, SERVICENOW_DEFAULT_SCOPE } from "./oauth-servicenow.server";
import { buildSlackAuthorizeUrl, SLACK_SCOPES } from "./oauth-slack.server";
import { createPkcePair } from "./oauth-framework.server";

describe("provider-aware OAuth contracts", () => {
  it("uses PKCE S256", () => { const { verifier, challenge } = createPkcePair(); expect(verifier.length).toBeGreaterThan(40); expect(challenge).not.toEqual(verifier); });
  it("builds the current Jira 3LO authorize contract", () => { const url = new URL(buildJiraAuthorizeUrl({ clientId: "jira-client", redirectUri: "https://cenops.test/integrations/jira/callback", state: "state", codeChallenge: "challenge" })); expect(url.origin + url.pathname).toBe("https://auth.atlassian.com/authorize"); expect(url.searchParams.get("audience")).toBe("api.atlassian.com"); expect(url.searchParams.get("response_type")).toBe("code"); expect(url.searchParams.get("prompt")).toBe("consent"); expect(url.searchParams.get("code_challenge_method")).toBe("S256"); expect(url.searchParams.get("scope")).toBe(JIRA_SCOPES.join(" ")); });
  it("never asks Salesforce for a customer-entered instance URL", () => { const url = new URL(buildSalesforceAuthorizeUrl({ clientId: "sf-client", redirectUri: "https://cenops.test/integrations/salesforce/callback", state: "state", codeChallenge: "challenge" })); expect(url.origin).toBe("https://login.salesforce.com"); expect(url.pathname).toBe("/services/oauth2/authorize"); expect(url.searchParams.get("scope")).toBe(SALESFORCE_SCOPES.join(" ")); });
  it("builds an instance-aware ServiceNow authorize URL", () => { const url = new URL(buildServiceNowAuthorizeUrl({ instanceUrl: "https://acme.service-now.com", clientId: "sn-client", redirectUri: "https://cenops.test/integrations/servicenow/callback", state: "state" })); expect(url.origin).toBe("https://acme.service-now.com"); expect(url.pathname).toBe("/oauth_auth.do"); expect(url.searchParams.get("scope")).toBe(SERVICENOW_DEFAULT_SCOPE); });
  it("builds Slack OAuth v2 with rotating-token PKCE", () => { const url = new URL(buildSlackAuthorizeUrl({ clientId: "slack-client", redirectUri: "https://cenops.test/integrations/slack/callback", state: "state", codeChallenge: "challenge" })); expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize"); expect(url.searchParams.get("scope")).toBe(SLACK_SCOPES.join(",")); expect(url.searchParams.get("code_challenge_method")).toBe("S256"); });
});
