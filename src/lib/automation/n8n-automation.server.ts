import crypto from "node:crypto";

import { decryptCredentials, encryptCredentials } from "@/lib/integrations/credential-vault.server";
import { runGovernedOperation, type UserClient } from "@/lib/execution/gateway.server";
import type {
  AutomationCallbackPayload,
  AutomationTriggerInput,
  AutomationTriggerReceipt,
  AutomationWorkflow,
  N8nWorkflowConfig,
} from "./automation-types";

function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function verifySignature(secret: string, body: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(secret, body), "utf8");
  const actual = Buffer.from(signature, "utf8");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function encryptN8nConfig(config: N8nWorkflowConfig): string {
  return encryptCredentials(config);
}

export function decryptN8nConfig(value: string): N8nWorkflowConfig {
  const config = decryptCredentials<N8nWorkflowConfig>(value);
  if (!config.webhookUrl || !/^https?:\/\//i.test(config.webhookUrl)) {
    throw new Error("The n8n webhook URL is invalid.");
  }
  if (!config.signingSecret || config.signingSecret.length < 32) {
    throw new Error("The n8n signing secret must be at least 32 characters.");
  }
  return config;
}

export async function createN8nWorkflow(
  supabase: UserClient,
  tenantId: string,
  createdBy: string,
  input: {
    name: string;
    webhookUrl: string;
    signingSecret: string;
    triggerType?: "webhook" | "schedule" | "event" | "manual";
    metadata?: Record<string, unknown>;
  },
): Promise<AutomationWorkflow> {
  const config = decryptN8nConfig(encryptN8nConfig({
    webhookUrl: input.webhookUrl.trim(),
    signingSecret: input.signingSecret,
  }));

  const { data, error } = await supabase
    .from("automation_workflows")
    .insert({
      tenant_id: tenantId,
      name: input.name.trim().slice(0, 120),
      provider: "n8n",
      trigger_type: input.triggerType ?? "webhook",
      status: "active",
      config_encrypted: encryptN8nConfig(config),
      metadata: input.metadata ?? {},
      created_by: createdBy,
    })
    .select("id, tenant_id, name, provider, trigger_type, status, metadata")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Automation workflow could not be created.");

  return {
    id: data.id,
    tenantId: data.tenant_id,
    name: data.name,
    provider: "n8n",
    triggerType: data.trigger_type,
    status: data.status,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
  };
}

export async function triggerN8nWorkflow(
  supabase: UserClient,
  actor: { userId: string; tenantId: string; actorRole: string; roles: string[] },
  input: AutomationTriggerInput,
): Promise<AutomationTriggerReceipt> {
  const { data: workflow, error } = await supabase
    .from("automation_workflows")
    .select("id, tenant_id, provider, status, config_encrypted")
    .eq("id", input.workflowId)
    .eq("tenant_id", actor.tenantId)
    .single();

  if (error || !workflow) throw new Error("Automation workflow was not found.");
  if (workflow.provider !== "n8n") throw new Error("Unsupported automation provider.");
  if (workflow.status !== "active") throw new Error("Automation workflow is disabled.");

  const config = decryptN8nConfig(workflow.config_encrypted);
  const traceId = input.traceId ?? crypto.randomUUID();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) throw new Error("An idempotency key is required.");

  const result = await runGovernedOperation(
    supabase,
    actor,
    {
      origin: "workflow",
      actionKey: input.actionKey ?? "automation.trigger",
      executionClass: input.executionClass ?? "read_only",
      agentKey: null,
      provider: "n8n",
      capability: "automation.trigger",
      affectedRecords: 1,
      confidence: 1,
      hasApproval: input.executionClass === "read_only",
    },
    async () => {
      const { data: run, error: runError } = await supabase
        .from("automation_runs")
        .insert({
          tenant_id: actor.tenantId,
          workflow_id: workflow.id,
          agent_run_id: input.agentRunId ?? null,
          trace_id: traceId,
          idempotency_key: idempotencyKey,
          status: "queued",
          input: input.input,
        })
        .select("id")
        .single();

      if (runError || !run) {
        if (runError?.code === "23505") {
          const { data: existing } = await supabase
            .from("automation_runs")
            .select("id, status, external_execution_id")
            .eq("workflow_id", workflow.id)
            .eq("idempotency_key", idempotencyKey)
            .single();
          if (existing) {
            return {
              automationRunId: existing.id,
              status: existing.status,
              provider: "n8n" as const,
              externalExecutionId: existing.external_execution_id,
            };
          }
        }
        throw new Error(runError?.message ?? "Automation run could not be created.");
      }

      const body = JSON.stringify({
        automationRunId: run.id,
        traceId,
        tenantScoped: true,
        input: input.input,
      });
      const signature = signPayload(config.signingSecret, body);

      const response = await fetch(config.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aegis-signature": signature,
          "x-aegis-automation-run-id": run.id,
          "x-aegis-trace-id": traceId,
        },
        body,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1000);
        await supabase.from("automation_runs").update({
          status: "failed",
          error: `n8n webhook returned HTTP ${response.status}: ${detail}`,
          completed_at: new Date().toISOString(),
        }).eq("id", run.id).eq("tenant_id", actor.tenantId);
        throw new Error(`n8n webhook returned HTTP ${response.status}.`);
      }

      let externalExecutionId: string | null = null;
      try {
        const responseJson = await response.json() as { executionId?: string; id?: string };
        externalExecutionId = responseJson.executionId ?? responseJson.id ?? null;
      } catch {
        // Webhook workflows commonly return an empty/204 response.
      }

      await supabase.from("automation_runs").update({
        status: "running",
        external_execution_id: externalExecutionId,
        started_at: new Date().toISOString(),
      }).eq("id", run.id).eq("tenant_id", actor.tenantId);

      await supabase.from("automation_run_events").insert({
        tenant_id: actor.tenantId,
        automation_run_id: run.id,
        event_type: "triggered",
        payload: { provider: "n8n", externalExecutionId },
      });

      return {
        automationRunId: run.id,
        status: "running" as const,
        provider: "n8n" as const,
        externalExecutionId,
      };
    },
  );

  if (!result.ok) throw new Error(result.reasons.join(" "));
  return result.result;
}

export async function handleN8nCallback(
  supabase: UserClient,
  automationRunId: string,
  rawBody: string,
  signature: string,
  payload: AutomationCallbackPayload,
): Promise<void> {
  const { data: run, error: runError } = await supabase
    .from("automation_runs")
    .select("id, tenant_id, workflow_id, status")
    .eq("id", automationRunId)
    .single();
  if (runError || !run) throw new Error("Automation run was not found.");

  const { data: workflow, error: workflowError } = await supabase
    .from("automation_workflows")
    .select("config_encrypted")
    .eq("id", run.workflow_id)
    .eq("tenant_id", run.tenant_id)
    .single();
  if (workflowError || !workflow) throw new Error("Automation workflow was not found.");

  const config = decryptN8nConfig(workflow.config_encrypted);
  if (!verifySignature(config.signingSecret, rawBody, signature)) {
    throw new Error("Invalid automation callback signature.");
  }
  if (payload.automationRunId !== automationRunId) {
    throw new Error("Automation callback run id does not match the request path.");
  }

  await supabase.from("automation_runs").update({
    status: payload.status,
    external_execution_id: payload.externalExecutionId ?? null,
    result: payload.result ?? null,
    error: payload.error ?? null,
    completed_at: new Date().toISOString(),
  }).eq("id", automationRunId).eq("tenant_id", run.tenant_id);

  await supabase.from("automation_run_events").insert({
    tenant_id: run.tenant_id,
    automation_run_id: automationRunId,
    event_type: "completed",
    payload: { status: payload.status, externalExecutionId: payload.externalExecutionId ?? null },
  });
}
