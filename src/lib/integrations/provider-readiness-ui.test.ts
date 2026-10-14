import { describe, expect, it } from "vitest";
import { providerReadiness } from "./provider-contract";

describe("provider readiness UI contract", () => {
  it("keeps catalog and authentication availability distinct from production connectors", () => {
    expect(providerReadiness("genesys")).toBe("production_connector");
    expect(providerReadiness("github")).toBe("production_connector");
    expect(providerReadiness("aws")).toBe("auth_only");
    expect(providerReadiness("azure")).toBe("auth_only");
    expect(providerReadiness("unknown")).toBe("catalog_only");
  });
});
