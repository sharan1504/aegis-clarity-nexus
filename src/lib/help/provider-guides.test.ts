import { describe, expect, it } from "vitest";

import { PROVIDER_REGISTRY } from "@/lib/integrations/provider-registry";
import { HELP_TOPIC_BY_ID } from "./content";
import { PROVIDER_HELP_TOPICS } from "./provider-guides";
import { PROVIDER_SETUP_GUIDES } from "@/lib/integrations/provider-setup-guides";

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


describe("provider setup guide catalog", () => {
  it("has a typed setup guide for every registry provider", () => {
    expect(PROVIDER_SETUP_GUIDES).toHaveLength(PROVIDER_REGISTRY.length);
    const ids = new Set(PROVIDER_SETUP_GUIDES.map((guide) => guide.providerId));
    expect(ids.size).toBe(PROVIDER_REGISTRY.length);
    for (const provider of PROVIDER_REGISTRY) {
      const guide = PROVIDER_SETUP_GUIDES.find((item) => item.providerId === provider.id);
      expect(guide, provider.id).toBeDefined();
      expect(guide?.summary).toBeTruthy();
      expect(guide?.prerequisites.length).toBeGreaterThan(0);
      expect(guide?.providerSteps.length).toBeGreaterThan(0);
      expect(guide?.cenopsSteps.length).toBeGreaterThan(0);
      expect(guide?.fieldMap.length).toBeGreaterThan(0);
      expect(guide?.officialLinks.length).toBeGreaterThan(0);
      expect(guide?.troubleshooting.length).toBeGreaterThan(0);
      for (const link of guide?.officialLinks ?? []) {
        expect(link.url).toMatch(/^https?:\/\//);
      }
    }
  });

  it("exposes setup fields and official documentation through every help topic", () => {
    for (const topic of PROVIDER_HELP_TOPICS) {
      expect(topic.sections.some((section) => section.heading === "CenOps fields")).toBe(true);
      expect(topic.sections.some((section) => section.heading === "Official documentation")).toBe(true);
    }
  });
});
