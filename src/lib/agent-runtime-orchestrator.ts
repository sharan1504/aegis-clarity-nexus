import type { AgentRunState, AgentRunStep } from "./agent-runtime";
import { AGENT_RUN_STEPS, transitionAgentRun } from "./agent-runtime";

export type RuntimeOrchestratorAction =
  | { type: "investigate"; value: unknown }
  | { type: "policy"; value: unknown }
  | { type: "await_approval"; value: unknown }
  | { type: "approve"; value: unknown }
  | { type: "execute"; value: unknown }
  | { type: "verify"; value: unknown };

export interface RuntimeOrchestratorResult {
  run: AgentRunState;
  completedActions: RuntimeOrchestratorAction[];
  stoppedAt: AgentRunStep;
}

/** Coordinates trusted runtime stages; authorization remains deterministic. */
export function orchestrateAgentRun(
  initial: AgentRunState,
  actions: RuntimeOrchestratorAction[],
  clock: { now(): string },
): RuntimeOrchestratorResult {
  let run = initial;
  if (run.status === "planned") run = transitionAgentRun(run, { type: "start" }, clock);
  const completedActions: RuntimeOrchestratorAction[] = [];

  for (const action of actions) {
    if (action.type === "await_approval") {
      run = transitionAgentRun(run, { type: "await_approval", approval: action.value }, clock);
      completedActions.push(action);
      break;
    }
    if (action.type === "approve") {
      if (run.status !== "waiting_approval") throw new Error(`Runtime cannot approve from ${run.status}.`);
      run = transitionAgentRun(run, { type: "resume" }, clock);
      run = transitionAgentRun(run, { type: "complete_step", step: "approval", value: action.value }, clock);
      completedActions.push(action);
      continue;
    }

    const expectedStep: AgentRunStep = action.type === "investigate" ? "investigate" : action.type === "policy" ? "policy" : action.type === "execute" ? "execute" : "verify";
    if (run.currentStep !== expectedStep) throw new Error(`Runtime expected ${run.currentStep} but received ${expectedStep}.`);
    run = transitionAgentRun(run, { type: "complete_step", step: expectedStep, value: action.value }, clock);
    completedActions.push(action);
    if (run.status === "completed") break;
  }
  return { run, completedActions, stoppedAt: run.currentStep };
}

export function nextRuntimeStep(step: AgentRunStep): AgentRunStep | null {
  const index = AGENT_RUN_STEPS.indexOf(step);
  return index >= 0 && index < AGENT_RUN_STEPS.length - 1 ? AGENT_RUN_STEPS[index + 1] : null;
}
