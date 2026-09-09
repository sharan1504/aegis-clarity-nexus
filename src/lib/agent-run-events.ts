import type { JsonValue } from "@/lib/json";
import type { AgentRunState, AgentRunStep } from "@/lib/agent-runtime";

export const AGENT_RUN_EVENT_TYPES = [
  "run_created",
  "stage_started",
  "stage_completed",
  "approval_requested",
  "approval_resolved",
  "tool_call",
  "execution_attempted",
  "execution_completed",
  "verification_completed",
  "run_failed",
  "run_cancelled",
] as const;

export type AgentRunEventType = (typeof AGENT_RUN_EVENT_TYPES)[number];

export interface AgentRunEvent {
  id: string;
  runId: string;
  tenantId: string;
  sequence: number;
  eventType: AgentRunEventType;
  step: AgentRunStep | null;
  actorId: string | null;
  provider: string | null;
  capabilityKey: string | null;
  outcome: string | null;
  payload: JsonValue;
  occurredAt: string;
}

export interface AgentRunEventInput {
  eventType: AgentRunEventType;
  step?: AgentRunStep | null;
  actorId?: string | null;
  provider?: string | null;
  capabilityKey?: string | null;
  outcome?: string | null;
  payload?: unknown;
}

export function eventForTransition(
  previous: AgentRunState,
  next: AgentRunState,
  input: AgentRunEventInput,
): AgentRunEventInput[] {
  const events: AgentRunEventInput[] = [];
  if (previous.status === "planned" && next.status === "running") {
    events.push({ eventType: "stage_started", step: next.currentStep });
  }
  if (previous.status !== "waiting_approval" && next.status === "waiting_approval") {
    events.push({ eventType: "approval_requested", step: "approval", outcome: "pending", payload: next.approval });
  }
  if (previous.status === "waiting_approval" && next.status === "running") {
    events.push({ eventType: "approval_resolved", step: "approval", outcome: "approved", payload: next.approval });
  }
  if (input.eventType !== "stage_started" || previous.currentStep !== next.currentStep) {
    events.push(input);
  }
  if (previous.status !== "failed" && next.status === "failed") {
    events.push({ eventType: "run_failed", step: previous.currentStep, outcome: "failed", payload: { error: next.error } });
  }
  if (previous.status !== "cancelled" && next.status === "cancelled") {
    events.push({ eventType: "run_cancelled", step: previous.currentStep, outcome: "cancelled" });
  }
  return events;
}

export function replayFromEvents(events: AgentRunEvent[]): AgentRunEvent[] {
  return [...events].sort((a, b) => a.sequence - b.sequence);
}
