import { describe, expect, it } from "vitest";

import { findUnavailableRequestedCapabilities } from "./agent-prompt-workflow.functions";

describe("findUnavailableRequestedCapabilities", () => {
  it("identifies Salesforce when no Salesforce capability is enabled", () => {
    expect(findUnavailableRequestedCapabilities("Create a Salesforce case and notify the team by email", [])).toEqual([
      "Salesforce integration/capability",
      "email/notification capability",
    ]);
  });

  it("does not reject email when a notification capability is actually available", () => {
    const capabilities = [{ provider: "Notifications", capability: "email_notification", name: "Email notification", mock: false }];
    expect(findUnavailableRequestedCapabilities("Send an email alert", capabilities)).toEqual([]);
  });

  it("does not reject Salesforce when a Salesforce capability is enabled", () => {
    const capabilities = [{ provider: "Salesforce", capability: "case_inventory", name: "Salesforce cases", mock: false }];
    expect(findUnavailableRequestedCapabilities("Review Salesforce cases", capabilities)).toEqual([]);
  });

  it("requires a GitHub provider when the request explicitly targets GitHub", () => {
    const capabilities = [{ provider: "AWS", capability: "security_findings", name: "Security findings", mock: true }];
    expect(findUnavailableRequestedCapabilities("Find high severity security findings in GitHub repositories", capabilities)).toEqual([
      "GitHub integration",
    ]);
  });

  it("allows GitHub security findings when the provider and capability are enabled", () => {
    const capabilities = [{ provider: "GitHub", capability: "security_findings", name: "Security findings", mock: false }];
    expect(findUnavailableRequestedCapabilities("Find high severity security findings in GitHub repositories", capabilities)).toEqual([]);
  });

  it("requires a security findings capability for security requests", () => {
    const capabilities = [{ provider: "GitHub", capability: "repo_inventory", name: "Repository inventory", mock: false }];
    expect(findUnavailableRequestedCapabilities("Investigate high severity security findings", capabilities)).toEqual([
      "security findings capability",
    ]);
  });
});
