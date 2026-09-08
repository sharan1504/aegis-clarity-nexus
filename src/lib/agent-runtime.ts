export const AGENT_RUN_STATUSES = [
  "planned",
  "running",
  "waiting_approval",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export const AGENT_RUN_STEPS = ["plan", "investigate", "policy", "approval", "execute", "verify"] as const;
export type AgentRunStep = (typeof AGENT_RUN_STEPS)[number];
export interface AgentRunState {
  runId: string; tenantId: string; agentKey: string; status: AgentRunStatus; currentStep: AgentRunStep; input: string;
  plan: unknown | null; evidence: unknown[]; policyVerdict: unknown | null; approval: unknown | null;
  execution: unknown | null; verification: unknown | null; error: string | null; createdAt: string; updatedAt: string;
}
export interface AgentRunClock { now(): string; }
export interface AgentRunIdFactory { create(): string; }
const defaultClock: AgentRunClock = { now: () => new Date().toISOString() };
const defaultIdFactory: AgentRunIdFactory = { create: () => `run-${crypto.randomUUID()}` };
export function createAgentRunState(input: Pick<AgentRunState, "tenantId" | "agentKey" | "input">, dependencies: { clock?: AgentRunClock; idFactory?: AgentRunIdFactory } = {}): AgentRunState {
  const clock = dependencies.clock ?? defaultClock; const idFactory = dependencies.idFactory ?? defaultIdFactory; const timestamp = clock.now();
  return { runId: idFactory.create(), tenantId: input.tenantId, agentKey: input.agentKey, status: "planned", currentStep: "plan", input: input.input, plan: null, evidence: [], policyVerdict: null, approval: null, execution: null, verification: null, error: null, createdAt: timestamp, updatedAt: timestamp };
}
export function transitionAgentRun(run: AgentRunState, transition:
  | { type: "start" } | { type: "await_approval"; approval: unknown } | { type: "resume" }
  | { type: "complete_step"; step: AgentRunStep; value?: unknown } | { type: "fail"; error: string } | { type: "cancel" }, clock: AgentRunClock = defaultClock): AgentRunState {
  const next = { ...run, updatedAt: clock.now() };
  switch (transition.type) {
    case "start": if (run.status !== "planned" && run.status !== "paused") throw new Error(`Run cannot start from ${run.status}.`); return { ...next, status: "running", error: null };
    case "await_approval": if (run.status !== "running") throw new Error("Only a running run can wait for approval."); return { ...next, status: "waiting_approval", approval: transition.approval };
    case "resume": if (run.status !== "waiting_approval" && run.status !== "paused") throw new Error(`Run cannot resume from ${run.status}.`); return { ...next, status: "running", error: null };
    case "complete_step": {
      if (run.status !== "running") throw new Error("Only a running run can complete a step.");
      if (run.currentStep !== transition.step) throw new Error(`Runtime expected ${run.currentStep} but received ${transition.step}.`);
      const values = { plan: "plan", investigate: "evidence", policy: "policyVerdict", approval: "approval", execute: "execution", verify: "verification" } as const;
      const field = values[transition.step]; const updated = { ...next, [field]: transition.step === "investigate" ? [...run.evidence, transition.value] : transition.value } as AgentRunState;
      const index = AGENT_RUN_STEPS.indexOf(transition.step); if (index === AGENT_RUN_STEPS.length - 1) return { ...updated, status: "completed", currentStep: "verify" };
      return { ...updated, currentStep: AGENT_RUN_STEPS[index + 1] };
    }
    case "fail": return { ...next, status: "failed", error: transition.error.slice(0, 2000) };
    case "cancel": return { ...next, status: "cancelled" };
  }
}
