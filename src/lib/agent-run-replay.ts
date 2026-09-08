import type { AgentRunState, AgentRunStep } from "@/lib/agent-runtime";
import type { AgentRunEvent } from "@/lib/agent-run-events";

export interface AgentRunReplayEvent {
  step: AgentRunStep;
  label: string;
  state: "completed" | "current" | "pending" | "blocked";
  value: unknown | null;
}
export interface EvidenceGraphNode { id: string; kind: "finding" | "evidence" | "agent" | "policy" | "recommendation" | "approval" | "execution" | "verification"; label: string; detail?: string; }
export interface EvidenceGraphEdge { from: string; to: string; label: string; }
export interface AgentRunReplay { events: AgentRunReplayEvent[]; nodes: EvidenceGraphNode[]; edges: EvidenceGraphEdge[]; timeline: AgentRunEvent[]; }
const labels: Record<AgentRunStep, string> = { plan: "Plan", investigate: "Investigate", policy: "Policy", approval: "Approval", execute: "Execute", verify: "Verify" };
const values: Record<AgentRunStep, keyof AgentRunState | null> = { plan: "plan", investigate: "evidence", policy: "policyVerdict", approval: "approval", execute: "execution", verify: "verification" };

export function buildAgentRunReplay(run: AgentRunState, persistedEvents: AgentRunEvent[] = []): AgentRunReplay {
  const ordered = Object.keys(labels) as AgentRunStep[]; const currentIndex = ordered.indexOf(run.currentStep);
  const events = ordered.map((step, index): AgentRunReplayEvent => {
    const value = values[step] ? run[values[step] as keyof AgentRunState] : null;
    const completed = run.status === "completed" || index < currentIndex; const blocked = run.status === "failed" && index >= currentIndex;
    const state: AgentRunReplayEvent["state"] = blocked ? "blocked" : completed ? "completed" : index === currentIndex ? "current" : "pending";
    return { step, label: labels[step], state, value: Array.isArray(value) ? value[value.length - 1] ?? null : value };
  });

  const nodes: EvidenceGraphNode[] = [
    { id: "intent", kind: "finding", label: "User intent", detail: run.input },
    { id: "agent", kind: "agent", label: run.agentKey, detail: "Governed agent runtime" },
  ];
  const edges: EvidenceGraphEdge[] = [{ from: "intent", to: "agent", label: "invokes" }];
  if (run.plan !== null) { nodes.push({ id: "plan", kind: "evidence", label: "Generated plan", detail: "Inspectable workflow plan" }); edges.push({ from: "agent", to: "plan", label: "plans" }); }
  run.evidence.forEach((evidence, index) => { const evidenceId = `evidence-${index}`; nodes.push({ id: evidenceId, kind: "evidence", label: `Evidence ${index + 1}`, detail: summarize(evidence) }); edges.push({ from: "agent", to: evidenceId, label: "collects" }); if (index === 0 && run.plan !== null) edges.push({ from: "plan", to: evidenceId, label: "investigates" }); });
  if (run.policyVerdict !== null) { nodes.push({ id: "policy", kind: "policy", label: "Policy decision", detail: summarize(run.policyVerdict) }); edges.push({ from: run.evidence.length ? `evidence-${run.evidence.length - 1}` : "agent", to: "policy", label: "evaluates" }); }
  if (hasRecommendations(run.policyVerdict)) { nodes.push({ id: "recommendation", kind: "recommendation", label: "Recommendations", detail: `${recommendationCount(run.policyVerdict)} eligible action(s)` }); edges.push({ from: "policy", to: "recommendation", label: "recommends" }); }
  if (run.approval !== null) { nodes.push({ id: "approval", kind: "approval", label: "Human approval", detail: summarize(run.approval) }); edges.push({ from: hasRecommendations(run.policyVerdict) ? "recommendation" : "policy", to: "approval", label: "requires" }); }
  if (run.execution !== null) { nodes.push({ id: "execution", kind: "execution", label: "Execution", detail: summarize(run.execution) }); edges.push({ from: "approval", to: "execution", label: "authorizes" }); }
  if (run.verification !== null) { nodes.push({ id: "verification", kind: "verification", label: "Verification", detail: summarize(run.verification) }); edges.push({ from: "execution", to: "verification", label: "verifies" }); }
  return { events, nodes, edges, timeline: [...persistedEvents].sort((a, b) => a.sequence - b.sequence) };
}
function summarize(value: unknown): string { if (typeof value === "string") return value.slice(0, 180); if (value === null || value === undefined) return "No recorded value"; try { return JSON.stringify(value).slice(0, 240); } catch { return "Recorded runtime value"; } }
function hasRecommendations(value: unknown): boolean { return recommendationCount(value) > 0; }
function recommendationCount(value: unknown): number { if (!value || typeof value !== "object") return 0; const candidate = value as { recommendations?: unknown }; return Array.isArray(candidate.recommendations) ? candidate.recommendations.length : 0; }
