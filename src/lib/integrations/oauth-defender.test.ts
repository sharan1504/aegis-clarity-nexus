import { describe, expect, it } from "vitest";
import { DEFENDER_API_BASE_URL, DEFENDER_RESOURCE_SCOPE, DEFENDER_VALIDATION_PATH } from "./oauth-defender.server";

describe("Microsoft Defender application authentication", () => {
  it("uses the documented Defender resource scope and validation API", () => {
    expect(DEFENDER_RESOURCE_SCOPE).toBe("https://api.security.microsoft.com/.default");
    expect(DEFENDER_API_BASE_URL).toBe("https://api.security.microsoft.com");
    expect(DEFENDER_VALIDATION_PATH).toBe("/api/alerts?$top=1");
  });
});
