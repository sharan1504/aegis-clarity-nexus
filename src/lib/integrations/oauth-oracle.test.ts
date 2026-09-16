import { describe, expect, it } from "vitest";
import { ORACLE_GRANT_TYPE, ORACLE_TOKEN_PATH, ORACLE_VALIDATION_PATH } from "./oauth-oracle.server";

describe("Oracle Identity Domains OAuth", () => {
  it("uses the documented client credentials grant", () => {
    expect(ORACLE_GRANT_TYPE).toBe("client_credentials");
  });

  it("uses the documented token and validation endpoints", () => {
    expect(ORACLE_TOKEN_PATH).toBe("/oauth2/v1/token");
    expect(ORACLE_VALIDATION_PATH).toBe("/admin/v1/Apps?count=1");
  });
});
