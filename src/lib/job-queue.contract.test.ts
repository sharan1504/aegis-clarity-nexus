import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(new URL("../../scripts/aegis-job-worker.mjs", import.meta.url), "utf8");
const scheduledSource = readFileSync(new URL("../../supabase/functions/scheduled-provider-sync/index.ts", import.meta.url), "utf8");
const webhookSource = readFileSync(new URL("../../supabase/functions/dispatch-webhooks/index.ts", import.meta.url), "utf8");

describe("durable job queue contract", () => {
  it("configures five total attempts with exponential backoff", () => {
    expect(workerSource).toContain("retryLimit: 4");
    expect(workerSource).toContain("retryDelay: 30");
    expect(workerSource).toContain("retryBackoff: true");
    expect(workerSource).toContain("deadLetter");
  });

  it("keeps tenant identity and idempotency keys in every enqueue", () => {
    expect(workerSource).toContain("body.tenantId");
    expect(workerSource).toContain("body.idempotencyKey");
    expect(workerSource).toContain("group: { id: body.tenantId }");
    expect(scheduledSource).toContain("idempotencyKey");
    expect(webhookSource).toContain("idempotencyKey");
  });

  it("moves scheduler side effects behind the durable queue", () => {
    expect(scheduledSource).not.toContain("PROVIDER_SYNC_INTERNAL_URL");
    expect(webhookSource).not.toContain("fetch(webhook.target_url");
    expect(webhookSource).toContain("aegis.webhook-delivery");
  });
});
