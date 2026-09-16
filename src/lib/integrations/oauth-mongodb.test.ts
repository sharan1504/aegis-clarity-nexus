import { describe, expect, it } from "vitest";
import { MONGODB_ATLAS_ORGS_URL, MONGODB_ATLAS_TOKEN_URL } from "./oauth-mongodb.server";

describe("MongoDB Atlas service account OAuth", () => {
  it("uses MongoDB's documented service-account token endpoint", () => {
    expect(MONGODB_ATLAS_TOKEN_URL).toBe("https://cloud.mongodb.com/api/oauth/token");
  });

  it("validates against the Atlas Administration API organizations endpoint", () => {
    expect(MONGODB_ATLAS_ORGS_URL).toBe("https://cloud.mongodb.com/api/atlas/v2/orgs");
  });
});
