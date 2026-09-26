import { describe, expect, it } from "vitest";
import { HELP_TOPIC_BY_ID } from "@/lib/help/content";
import { DISCOVERY_FEATURES, FEATURE_HELP_BY_PATH, TOUR_STEPS } from "./onboarding-config";

describe("CenOps discovery configuration", () => {
  it("defines the complete five-step first-run tour", () => {
    expect(TOUR_STEPS.map((step) => step.id)).toEqual([
      "welcome",
      "command-center",
      "integrations",
      "agents",
      "copilot",
    ]);
    expect(TOUR_STEPS).toHaveLength(5);
  });

  it("reuses existing Help topics for every discovery feature", () => {
    for (const feature of DISCOVERY_FEATURES) {
      expect(HELP_TOPIC_BY_ID[feature.helpTopic]).toBeDefined();
      expect(feature.route).toBeTruthy();
    }
    for (const topicId of Object.values(FEATURE_HELP_BY_PATH)) {
      expect(HELP_TOPIC_BY_ID[topicId]).toBeDefined();
    }
  });

  it("covers the analytics workspace route with contextual help", () => {
    expect(FEATURE_HELP_BY_PATH["/analytics"]).toBe("analytics-reports");
    expect(FEATURE_HELP_BY_PATH["/analytics/workspace"]).toBe("analytics-reports");
  });
});
