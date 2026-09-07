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
});
