import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "src");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("integration security architecture", () => {
  it("does not retain runtime Genesys access to the plaintext credential table", () => {
    expect(read("lib/genesys/store.server.ts")).not.toContain('from("integration_credentials")');
    expect(read("lib/integrations-genesys.functions.ts")).not.toContain('from("integration_credentials")');
  });

  it("does not contain static AWS access-key fields in the AWS connect runtime", () => {
    const source = read("lib/integrations/provider-functions.ts");
    expect(source).not.toContain("accessKeyId");
    expect(source).not.toContain("secretAccessKey");
    expect(read("lib/integrations/aws-credentials.ts")).toContain("roleArn");
    expect(read("lib/integrations/aws-credentials.ts")).toContain("externalId");
  });

  it("does not use the legacy GitHub /user/repos sync endpoint", () => {
    expect(read("lib/provider-sync.functions.ts")).not.toContain("/user/repos");
  });

  it("registers Microsoft 365 in the provider-neutral capability router", () => {
    const source = read("lib/capabilities/router.server.ts");
    expect(source).toContain("microsoft365Impl");
    expect(source).toContain("microsoft365: microsoft365Impl");
  });
});
