import { beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: class { send = send; },
  AssumeRoleCommand: class { input: Record<string, unknown>; constructor(input: Record<string, unknown>) { this.input = input; } },
  GetCallerIdentityCommand: class { input: Record<string, unknown>; constructor(input: Record<string, unknown>) { this.input = input; } },
}));

import { buildAwsTrustPolicy, generateAwsExternalId, getCenOpsAwsAccountId, validateProviderConnection } from "./production-connectors.server";

describe("AWS IAM role integration", () => {
  beforeEach(() => send.mockReset());

  it("uses STS AssumeRole with the AWS-documented parameters and never returns temporary credentials", async () => {
    send.mockResolvedValueOnce({ AssumedRoleUser: { Arn: "arn:aws:sts::123456789012:assumed-role/CenOpsReadOnly/cenops-test" }, Credentials: { AccessKeyId: "temporary-access-key", SecretAccessKey: "temporary-secret", SessionToken: "temporary-session-token", Expiration: new Date("2026-09-15T20:00:00.000Z") } });
    const result = await validateProviderConnection({ provider: "aws", tenantId: "tenant-1", connectionId: "connection-1", roleArn: "arn:aws:iam::123456789012:role/CenOpsReadOnly", externalId: "cenops-abc123" });
    expect(result.ok).toBe(true); expect(result.externalId).toBe("123456789012"); expect(result).not.toHaveProperty("accessToken"); expect(result).not.toHaveProperty("refreshToken");
    const command = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({ RoleArn: "arn:aws:iam::123456789012:role/CenOpsReadOnly", ExternalId: "cenops-abc123", DurationSeconds: 900 });
    expect(String(command.input.RoleSessionName)).toContain("cenops-tenant-1-connection-1");
  });
  it("generates different third-party external IDs", () => { const first = generateAwsExternalId(); const second = generateAwsExternalId(); expect(first).not.toBe(second); expect(first).toMatch(/^cenops-[a-f0-9]{32}$/); expect(second).toMatch(/^cenops-[a-f0-9]{32}$/); });
  it("generates the exact least-trust third-party trust policy", () => { expect(JSON.parse(buildAwsTrustPolicy("123456789012", "cenops-abc123"))).toEqual({ Version: "2012-10-17", Statement: { Effect: "Allow", Principal: { AWS: "123456789012" }, Action: "sts:AssumeRole", Condition: { StringEquals: { "sts:ExternalId": "cenops-abc123" } } } }); });
  it("resolves the CenOps AWS account from the server identity instead of hard-coding it", async () => { send.mockResolvedValueOnce({ Account: "987654321098" }); await expect(getCenOpsAwsAccountId()).resolves.toBe("987654321098"); const command = send.mock.calls[0]?.[0] as { input: Record<string, unknown> }; expect(command.input).toEqual({}); });
  it("fails if the server AWS account identity cannot be resolved", async () => { send.mockResolvedValueOnce({}); await expect(getCenOpsAwsAccountId()).rejects.toThrow("CenOps AWS account identity is not configured or could not be resolved."); });
});
