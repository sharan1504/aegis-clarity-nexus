import { describe, expect, it, vi, afterEach } from "vitest";
import { awsHealth, syncAwsMinimal, azureHealth, syncAzureMinimal } from "./cloud-connectors.server";

afterEach(() => vi.restoreAllMocks());

describe("cloud connector primitives", () => {
  it("uses AWS assumed-role identity for health and minimal sync", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ Credentials: { AccessKeyId: "a", SecretAccessKey: "s", SessionToken: "t" }, AssumedRoleUser: { Arn: "arn:aws:sts::123456789012:assumed-role/CenOps/a" } })
      .mockResolvedValueOnce({ Account: "123456789012" })
      .mockResolvedValueOnce({ Credentials: { AccessKeyId: "a", SecretAccessKey: "s", SessionToken: "t" }, AssumedRoleUser: { Arn: "arn:aws:sts::123456789012:assumed-role/CenOps/a" } })
      .mockResolvedValueOnce({ Account: "123456789012" });
    vi.mock("@aws-sdk/client-sts", () => ({ STSClient: class { send = send; }, AssumeRoleCommand: class { constructor(public input: unknown) {} }, GetCallerIdentityCommand: class { constructor(public input: unknown) {} } }));
    const credentials = { roleArn: "arn:aws:iam::123456789012:role/CenOpsReadOnly", externalId: "external" };
    await expect(awsHealth(credentials, "tenant-1", "connection-1")).resolves.toMatchObject({ ok: true, accountId: "123456789012" });
    await expect(syncAwsMinimal(credentials, "tenant-1", "connection-1")).resolves.toMatchObject({ rows: [{ entityType: "account", entityKey: "123456789012" }] });
  });

  it("fails Azure health on rejected Graph management calls", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" }), { status: 200 })).mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    await expect(azureHealth({ tenant: "tenant-1", clientId: "client-1", clientSecret: "secret" })).rejects.toThrow("Provider request failed (403)");
  });

  it("syncs Azure subscriptions as stable subscription entities", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ subscriptionId: "sub-1", displayName: "Production", state: "Enabled" }] }), { status: 200 }));
    const result = await syncAzureMinimal({ tenant: "tenant-1", clientId: "client-1", clientSecret: "secret" });
    expect(result.rows).toEqual([{ entityType: "subscription", entityKey: "sub-1", payload: { subscriptionId: "sub-1", displayName: "Production", state: "Enabled", tenantId: "tenant-1" } }]);
  });
});
