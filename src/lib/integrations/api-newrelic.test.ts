import { describe, expect, it } from "vitest";
import { NEW_RELIC_REGIONS } from "./api-newrelic.server";

describe("New Relic API authentication", () => {
  it("supports the documented NerdGraph regions", () => {
    expect(NEW_RELIC_REGIONS).toEqual(["us", "eu", "jp"]);
  });
});
