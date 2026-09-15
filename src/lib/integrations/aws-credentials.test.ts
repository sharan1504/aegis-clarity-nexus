import { describe, expect, it } from "vitest";
import { buildAwsStoredCredentials } from "./aws-credentials";

describe("AWS credential persistence", () => {
  it("stores only the role ARN and CenOps external ID", () => {
    expect(buildAwsStoredCredentials(
      "arn:aws:iam::123456789012:role/CenOpsReadOnly",
      "cenops-abc123",
    )).toEqual({
      roleArn: "arn:aws:iam::123456789012:role/CenOpsReadOnly",
      externalId: "cenops-abc123",
    });
  });
});
