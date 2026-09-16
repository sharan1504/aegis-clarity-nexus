import { describe, expect, it } from "vitest";

import { PROVIDER_REGISTRY } from "@/lib/integrations/provider-registry";
import { HELP_TOPIC_BY_ID } from "./content";
import { PROVIDER_HELP_TOPICS } from "./provider-guides";

describe("provider help guides", () => {
  it("documents every registry provider with a stable topic id", () => {
    expect(PROVIDER_HELP_TOPICS).toHaveLength(PROVIDER_REGISTRY.length);
    expect(new Set(PROVIDER_HELP_TOPICS.map((topic) => topic.id)).size).toBe(PROVIDER_REGISTRY.length);
    for (const provider of PROVIDER_REGISTRY) {
      expect(HELP_TOPIC_BY_ID[`provider-${provider.id}`]).toBeDefined();
    }
  });

  it("keeps the required sections on every provider guide", () => {
    const required = [
      "What it is",
      "Contract status",
      "Auth model",
      "Prerequisites",
      "Step-by-step connect",
      "Health & sync",
      "Connected criteria",
      "Capabilities",
      "Governed actions",
      "Common failures / integrity notes",
    ];
    for (const topic of PROVIDER_HELP_TOPICS) {
      const headings = new Set(topic.sections.map((section) => section.heading));
      for (const heading of required) expect(headings.has(heading), `${topic.id} missing ${heading}`).toBe(true);
      expect(topic.relatedRoutes?.some((route) => route.to === "/integrations")).toBe(true);
    }
  });

  it("keeps governed external write guidance scoped to GitHub", () => {
    const github = HELP_TOPIC_BY_ID["provider-github"];
    expect(github.sections.find((section) => section.heading === "Governed actions")?.body).toContain("GitHub create issue");
    for (const topic of PROVIDER_HELP_TOPICS.filter((topic) => topic.id !== "provider-github")) {
      expect(topic.sections.find((section) => section.heading === "Governed actions")?.body).toContain("Not enabled for external mutations");
    }
  });
});
