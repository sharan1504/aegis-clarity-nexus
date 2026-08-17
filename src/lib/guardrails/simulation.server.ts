// Builds a GuardrailContext from untrusted simulator input.
//
// The tenant and the actor's role always come from the verified session; the
// simulator may only describe the *operation*, never who is asking. That keeps
// a simulation faithful to real enforcement without becoming a way to probe
// another tenant's rules.
import type { GuardrailContext } from "./evaluate";
import {
  DATA_CLASSIFICATIONS,
  ENVIRONMENTS,
  EXECUTION_CLASSES,
  type DataClassification,
  type Environment,
  type ExecutionClass,
  type FreshnessValue,
} from "./types";

const FRESHNESS: FreshnessValue[] = ["fresh", "aging", "stale", "unavailable"];

function str(value: unknown, max = 160): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function num(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function buildSimulationContext(
  tenantId: string,
  roles: string[],
  input: Record<string, unknown>,
): GuardrailContext {
  const freshness = typeof input["freshness"] === "string" && FRESHNESS.includes(input["freshness"] as FreshnessValue)
    ? (input["freshness"] as FreshnessValue)
    : null;
  const classification = pick<DataClassification | "none">(
    input["dataClassification"],
    [...DATA_CLASSIFICATIONS, "none"] as const,
    "none",
  );

  return {
    tenantId,
    actorRole: roles[0] ?? null,
    origin: "simulator",
    agentKey: str(input["agentKey"]),
    provider: str(input["provider"]),
    integrationId: str(input["integrationId"]),
    capability: str(input["capability"]),
    actionKey: str(input["actionKey"]),
    environment: pick<Environment>(input["environment"], ENVIRONMENTS, "production"),
    executionClass: pick<ExecutionClass>(input["executionClass"], EXECUTION_CLASSES, "read_only"),
    affectedRecords: num(input["affectedRecords"]),
    confidence: num(input["confidence"]),
    freshness,
    dataClassification: classification === "none" ? null : classification,
    hasChangeTicket: Boolean(input["hasChangeTicket"]),
    hasApproval: Boolean(input["hasApproval"]),
    hasRollbackPlan: Boolean(input["hasRollbackPlan"]),
  };
}
