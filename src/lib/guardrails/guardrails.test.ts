import { describe, expect, it } from "vitest";

import { createFakeSupabase } from "@/lib/capabilities/__fixtures__/fake-supabase";
import { evaluateGuardrails, loadGuardrails } from "./engine.server";
import {
  evaluateGuardrailSet,
  sortGuardrails,
  unavailableVerdict,
  type GuardrailContext,
} from "./evaluate";
import { sanitizeOutput, scrubText } from "./sanitize";
import { buildSimulationContext } from "./simulation.server";
import {
  describeGuardrail,
  parseGuardrailConfig,
  type GuardrailRecord,
  type GuardrailScope,
} from "./types";

function rule(overrides: Partial<GuardrailRecord> = {}): GuardrailRecord {
  return {
    id: overrides.id ?? "g-1",
    tenantId: overrides.tenantId ?? null,
    name: overrides.name ?? "Rule",
    description: null,
    scope: overrides.scope ?? "platform",
    scopeId: overrides.scopeId ?? null,
    guardrailType: overrides.guardrailType ?? "block",
    enabled: overrides.enabled ?? true,
    priority: overrides.priority ?? 100,
    severity: overrides.severity ?? "high",
    enforcementMode: overrides.enforcementMode ?? "enforce",
    conditions: overrides.conditions ?? { is_destructive: true },
    action: overrides.action ?? { effect: "block" },
    message: overrides.message ?? null,
    isSystem: overrides.isSystem ?? true,
    version: overrides.version ?? 1,
  };
}

const ctx = (overrides: Partial<GuardrailContext> = {}): GuardrailContext => ({
  tenantId: "t-1",
  executionClass: "read_only",
  environment: "production",
  ...overrides,
});

describe("guardrail schema validation", () => {
  it("rejects unknown condition fields", () => {
    const result = parseGuardrailConfig({ shell_command: "rm -rf /" }, { effect: "block" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.field).toBe("conditions.shell_command");
  });

  it("rejects an unconditional guardrail", () => {
    const result = parseGuardrailConfig({}, { effect: "block" });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown effect", () => {
    const result = parseGuardrailConfig({ is_write: true }, { effect: "ignore" });
    expect(result.ok).toBe(false);
  });

  it("accepts a valid declarative rule", () => {
    const result = parseGuardrailConfig(
      { environment: "production", affected_records_gt: 20 },
      { effect: "require_approval" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.conditions.affected_records_gt).toBe(20);
  });

  it("renders a human-readable summary", () => {
    const text = describeGuardrail({
      scope: "platform",
      scopeId: null,
      conditions: { environment: "production", is_destructive: true },
      action: { effect: "require_approval" },
    });
    expect(text).toContain("production");
    expect(text).toContain("require an approved change");
  });
});

describe("precedence and conflict resolution", () => {
  it("orders platform scope ahead of tenant scopes", () => {
    const order = sortGuardrails([
      rule({ id: "tool", scope: "tool", isSystem: false }),
      rule({ id: "platform", scope: "platform" }),
      rule({ id: "agent", scope: "agent", isSystem: false }),
    ]).map((r) => r.id);
    expect(order).toEqual(["platform", "agent", "tool"]);
  });

  it("resolves conflicts to the most restrictive effect", () => {
    const verdict = evaluateGuardrailSet(
      [
        rule({ id: "a", conditions: { is_write: true }, action: { effect: "require_approval" } }),
        rule({ id: "b", scope: "agent", scopeId: "agent-license", isSystem: false, conditions: { is_write: true }, action: { effect: "block" } }),
      ],
      ctx({ executionClass: "destructive", agentKey: "agent-license" }),
    );
    expect(verdict.decision).toBe("block");
    expect(verdict.allowed).toBe(false);
  });

  it("does not let a narrower scope weaken a platform restriction", () => {
    const verdict = evaluateGuardrailSet(
      [
        rule({ id: "platform", conditions: { is_destructive: true }, action: { effect: "block" } }),
        rule({
          id: "agent-exception",
          scope: "agent",
          scopeId: "agent-license",
          isSystem: false,
          conditions: { is_destructive: true },
          action: { effect: "allow" },
        }),
      ],
      ctx({ executionClass: "destructive", agentKey: "agent-license" }),
    );
    expect(verdict.decision).toBe("block");
  });
});

describe("scope targeting", () => {
  const scopes: Array<[GuardrailScope, string, Partial<GuardrailContext>]> = [
    ["agent", "agent-license", { agentKey: "agent-license" }],
    ["integration", "genesys", { provider: "genesys" }],
    ["capability", "license_inventory", { capability: "license_inventory" }],
    ["tool", "revoke_license", { actionKey: "revoke_license" }],
    ["environment", "production", {}],
  ];

  it.each(scopes)("applies a %s-scoped guardrail only to its target", (scope, scopeId, extra) => {
    const rules = [
      rule({ scope, scopeId, isSystem: false, conditions: { is_write: true }, action: { effect: "block" } }),
    ];
    const matching = evaluateGuardrailSet(rules, ctx({ executionClass: "destructive", ...extra }));
    expect(matching.decision).toBe("block");

    const other = evaluateGuardrailSet(
      rules,
      ctx({
        executionClass: "destructive",
        environment: "development",
        agentKey: "other-agent",
        provider: "microsoft365",
        capability: "user_inventory",
        actionKey: "other_action",
      }),
    );
    expect(other.decision).toBe("allow");
  });
});

describe("condition evaluation", () => {
  it("blocks reads of stale data for write operations", () => {
    const rules = [
      rule({
        conditions: { freshness_in: ["stale", "unavailable"], is_write: true },
        action: { effect: "block" },
      }),
    ];
    expect(
      evaluateGuardrailSet(rules, ctx({ executionClass: "destructive", freshness: "stale" }))
        .decision,
    ).toBe("block");
    expect(
      evaluateGuardrailSet(rules, ctx({ executionClass: "destructive", freshness: "fresh" }))
        .decision,
    ).toBe("allow");
  });

  it("treats missing confidence as failing a confidence bar (fail closed)", () => {
    const rules = [
      rule({ conditions: { confidence_lt: 95 }, action: { effect: "require_confirmation" } }),
    ];
    expect(evaluateGuardrailSet(rules, ctx({ confidence: null })).decision).toBe("allow");
    expect(evaluateGuardrailSet(rules, ctx({ confidence: 80 })).decision).toBe(
      "require_confirmation",
    );
    expect(evaluateGuardrailSet(rules, ctx({ confidence: 99 })).decision).toBe("allow");
  });

  it("requires approval when a record limit is exceeded", () => {
    const verdict = evaluateGuardrailSet(
      [
        rule({
          guardrailType: "limit_records",
          conditions: { is_write: true },
          action: { effect: "limit", max_records: 20 },
        }),
      ],
      ctx({ executionClass: "high_risk", affectedRecords: 142 }),
    );
    expect(verdict.decision).toBe("require_approval");
    expect(verdict.maxRecords).toBe(20);
  });

  it("requires a change record when none is attached", () => {
    const rules = [
      rule({
        conditions: { environment: "production", is_destructive: true, has_change_ticket: false },
        action: { effect: "require_change_ticket" },
      }),
    ];
    expect(
      evaluateGuardrailSet(rules, ctx({ executionClass: "destructive", hasChangeTicket: false }))
        .decision,
    ).toBe("require_approval");
    expect(
      evaluateGuardrailSet(rules, ctx({ executionClass: "destructive", hasChangeTicket: true }))
        .decision,
    ).toBe("allow");
  });

  it("leaves read-only operations untouched by write guardrails", () => {
    const verdict = evaluateGuardrailSet(
      [rule({ conditions: { is_write: true }, action: { effect: "block" } })],
      ctx({ executionClass: "read_only" }),
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.matched).toHaveLength(0);
  });
});

describe("enforcement modes", () => {
  it("records monitor-mode matches without changing the decision", () => {
    const verdict = evaluateGuardrailSet(
      [
        rule({
          enforcementMode: "monitor",
          conditions: { is_write: true },
          action: { effect: "block" },
        }),
      ],
      ctx({ executionClass: "destructive" }),
    );
    expect(verdict.decision).toBe("allow");
    expect(verdict.matched[0]?.enforced).toBe(false);
  });

  it("ignores disabled guardrails", () => {
    const verdict = evaluateGuardrailSet(
      [rule({ enabled: false, conditions: { is_write: true }, action: { effect: "block" } })],
      ctx({ executionClass: "destructive" }),
    );
    expect(verdict.matched).toHaveLength(0);
  });
});

describe("fail-closed behaviour", () => {
  it("denies when guardrails cannot be loaded", async () => {
    const supabase = createFakeSupabase({ guardrails: [] }, ["guardrails"]);
    await expect(loadGuardrails(supabase as never, "t-1")).rejects.toThrow();

    const verdict = await evaluateGuardrails(supabase as never, ctx({ executionClass: "destructive" }));
    expect(verdict.decision).toBe("unavailable");
    expect(verdict.allowed).toBe(false);
    expect(verdict.maxRecords).toBe(0);
  });

  it("marks the unavailable verdict as denied", () => {
    expect(unavailableVerdict("boom").allowed).toBe(false);
  });
});

describe("tenant isolation and logging", () => {
  it("loads only the tenant's rules plus the platform baseline", async () => {
    const supabase = createFakeSupabase({
      guardrails: [
        { id: "p", tenant_id: null, name: "Platform", scope: "platform", scope_id: null, guardrail_type: "block", enabled: true, priority: 1, severity: "critical", enforcement_mode: "enforce", conditions: { is_write: true }, action: { effect: "block" }, message: null, is_system: true, version: 1, description: null },
        { id: "mine", tenant_id: "t-1", name: "Mine", scope: "organization", scope_id: null, guardrail_type: "block", enabled: true, priority: 5, severity: "high", enforcement_mode: "enforce", conditions: { is_write: true }, action: { effect: "block" }, message: null, is_system: false, version: 1, description: null },
        { id: "theirs", tenant_id: "t-2", name: "Theirs", scope: "organization", scope_id: null, guardrail_type: "block", enabled: true, priority: 5, severity: "high", enforcement_mode: "enforce", conditions: { is_write: true }, action: { effect: "block" }, message: null, is_system: false, version: 1, description: null },
      ],
    });

    const loaded = await loadGuardrails(supabase as never, "t-1");
    expect(loaded.map((g) => g.id).sort()).toEqual(["mine", "p"]);
  });

  it("writes an evaluation record for every decision", async () => {
    const supabase = createFakeSupabase({ guardrails: [] });
    await evaluateGuardrails(supabase as never, ctx(), { userId: "u-1", origin: "capability_router" });
    expect(supabase.inserted["guardrail_evaluations"]).toHaveLength(1);
    expect(supabase.inserted["guardrail_evaluations"]?.[0]?.["decision"]).toBe("allow");
  });
});

describe("output sanitization", () => {
  it("masks credential-shaped values in text", () => {
    expect(scrubText("token: Bearer abcdefghijklmnop1234")).not.toContain("abcdefghijklmnop1234");
    expect(scrubText("eyJhbGciOi.eyJzdWIiOi.signature123")).toBe("[redacted]");
  });

  it("redacts credential keys anywhere in a payload", () => {
    const safe = sanitizeOutput({
      user: { email: "a@b.com", access_token: "abc", nested: { client_secret: "s3cret" } },
    });
    expect(safe.user.access_token).toBe("[redacted]");
    expect(safe.user.nested.client_secret).toBe("[redacted]");
    expect(safe.user.email).toBe("a@b.com");
  });

  it("honours guardrail-requested field redaction", () => {
    const safe = sanitizeOutput({ userEmail: "a@b.com", userName: "A" }, ["userEmail"]);
    expect(safe.userEmail).toBe("[redacted]");
    expect(safe.userName).toBe("A");
  });
});

describe("simulation", () => {
  it("takes the tenant from the session and the operation from the input", () => {
    const built = buildSimulationContext("t-1", ["admin"], {
      tenantId: "t-999",
      executionClass: "destructive",
      environment: "nonsense",
      affectedRecords: "50",
      dataClassification: "secret",
    });
    expect(built.tenantId).toBe("t-1");
    expect(built.environment).toBe("production");
    expect(built.executionClass).toBe("destructive");
    expect(built.affectedRecords).toBe(50);
    expect(built.dataClassification).toBe("secret");
  });

  it("produces the same verdict as enforcement for the same operation", () => {
    const rules = [rule({ conditions: { is_destructive: true }, action: { effect: "block" } })];
    const simulated = buildSimulationContext("t-1", ["admin"], { executionClass: "destructive" });
    expect(evaluateGuardrailSet(rules, simulated).decision).toBe(
      evaluateGuardrailSet(rules, ctx({ executionClass: "destructive" })).decision,
    );
  });
});
