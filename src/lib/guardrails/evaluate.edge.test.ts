import { describe, expect, it } from "vitest";

import { evaluateGuardrailSet, type GuardrailContext } from "./evaluate";
import type { GuardrailRecord } from "./types";

const context = (overrides: Partial<GuardrailContext> = {}): GuardrailContext => ({
  tenantId: "tenant-1",
  executionClass: "read_only",
  environment: "production",
  ...overrides,
});

const rule = (overrides: Partial<GuardrailRecord> = {}): GuardrailRecord => ({
  id: overrides.id ?? "rule-1",
  tenantId: overrides.tenantId ?? "tenant-1",
  name: overrides.name ?? "Edge rule",
  description: null,
  scope: overrides.scope ?? "organization",
  scopeId: overrides.scopeId ?? null,
  guardrailType: overrides.guardrailType ?? "block",
  enabled: overrides.enabled ?? true,
  priority: overrides.priority ?? 100,
  severity: overrides.severity ?? "high",
  enforcementMode: overrides.enforcementMode ?? "enforce",
  conditions: overrides.conditions ?? { is_write: true },
  action: overrides.action ?? { effect: "block" },
  message: null,
  isSystem: false,
  version: 1,
});

describe("evaluateGuardrailSet edge cases", () => {
  it("requires approval only when a record-limit operation exceeds its limit", () => {
    const rules = [rule({ guardrailType: "limit_records", action: { effect: "limit", max_records: 10 } })];

    expect(evaluateGuardrailSet(rules, context({ executionClass: "high_risk", affectedRecords: 10 })).decision).toBe("allow");
    expect(evaluateGuardrailSet(rules, context({ executionClass: "high_risk", affectedRecords: 11 })).decision).toBe("require_approval");
  });

  it("does not match a confidence guardrail when confidence is missing", () => {
    const rules = [rule({ conditions: { confidence_lt: 90 }, action: { effect: "require_confirmation" } })];

    expect(evaluateGuardrailSet(rules, context({ confidence: null })).decision).toBe("allow");
    expect(evaluateGuardrailSet(rules, context({ confidence: 89 })).decision).toBe("require_confirmation");
    expect(evaluateGuardrailSet(rules, context({ confidence: 90 })).decision).toBe("allow");
  });

  it("requires every declared condition to match", () => {
    const rules = [
      rule({
        conditions: {
          provider: "genesys",
          capability_in: ["license_inventory"],
          is_write: true,
          role_in: ["admin", "manager"],
        },
        action: { effect: "require_approval" },
      }),
    ];

    expect(
      evaluateGuardrailSet(
        rules,
        context({ provider: "genesys", capability: "license_inventory", executionClass: "low_risk", actorRole: "manager" }),
      ).decision,
    ).toBe("require_approval");

    expect(
      evaluateGuardrailSet(
        rules,
        context({ provider: "genesys", capability: "user_inventory", executionClass: "low_risk", actorRole: "manager" }),
      ).decision,
    ).toBe("allow");
  });
});
