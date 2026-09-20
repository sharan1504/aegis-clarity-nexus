export type AutomationProvider = "n8n";
export type AutomationTriggerType = "webhook" | "schedule" | "event" | "manual";
export type AutomationStatus = "active" | "disabled";
export type AutomationRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface N8nWorkflowConfig {
  webhookUrl: string;
  signingSecret: string;
}

export interface AutomationWorkflow {
  id: string;
  tenantId: string;
  name: string;
  provider: AutomationProvider;
  triggerType: AutomationTriggerType;
  status: AutomationStatus;
  metadata: Record<string, unknown>;
}

export interface AutomationTriggerInput {
  workflowId: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
  traceId?: string;
  agentRunId?: string;
  actionKey?: string;
  executionClass?: "read_only" | "write" | "destructive";
}

export interface AutomationTriggerReceipt {
  automationRunId: string;
  status: AutomationRunStatus;
  provider: AutomationProvider;
  externalExecutionId?: string | null;
}

export interface AutomationCallbackPayload {
  automationRunId: string;
  status: Extract<AutomationRunStatus, "succeeded" | "failed" | "cancelled">;
  externalExecutionId?: string | null;
  result?: unknown;
  error?: string | null;
}
