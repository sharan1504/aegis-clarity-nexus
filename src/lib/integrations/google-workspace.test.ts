import { describe, expect, it } from "vitest";
import { GOOGLE_WORKSPACE_SCOPES } from "./google-workspace.server";

describe("Google Workspace service-account authentication", () => {
  it("uses read-only Directory API scopes for users and groups", () => {
    expect(GOOGLE_WORKSPACE_SCOPES).toEqual([
      "https://www.googleapis.com/auth/admin.directory.user.readonly",
      "https://www.googleapis.com/auth/admin.directory.group.readonly",
    ]);
  });
});
