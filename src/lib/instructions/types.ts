// ORGANIZATION INSTRUCTIONS & GUIDELINES — vocabulary and validation.
//
// Client-safe. No credentials, no server imports.
//
// An instruction is GUIDANCE, not enforcement. It shapes how an agent phrases,
// prioritizes, and explains its work. It can never grant a permission, relax a
// guardrail, or change a policy outcome. Guardrails are evaluated by the server
// before an operation runs; instructions are only ever composed into the model
// context after that decision has already been made.

export type InstructionScope = "organization" | "agent" | "integration" | "capability";

export const INSTRUCTION_SCOPES: InstructionScope[] = [
  "organization",
  "agent",
  "integration",
  "capability",
];

/** Lower index = broader. Broader instructions are composed first. */
export function instructionScopeRank(scope: InstructionScope): number {
  const index = INSTRUCTION_SCOPES.indexOf(scope);
  return index === -1 ? INSTRUCTION_SCOPES.length : index;
}

export const INSTRUCTION_SCOPE_LABELS: Record<InstructionScope, string> = {
  organization: "Whole organization",
  agent: "A specific agent",
  integration: "A specific connector",
  capability: "A specific capability",
};

export type InstructionCategory =
  | "general"
  | "tone"
  | "escalation"
  | "reporting"
  | "terminology"
  | "prioritization"
  | "compliance"
  | "operating_hours";

export const INSTRUCTION_CATEGORIES: InstructionCategory[] = [
  "general",
  "tone",
  "escalation",
  "reporting",
  "terminology",
  "prioritization",
  "compliance",
  "operating_hours",
];

export const INSTRUCTION_CATEGORY_LABELS: Record<InstructionCategory, string> = {
  general: "General guidance",
  tone: "Tone & communication",
  escalation: "Escalation etiquette",
  reporting: "Reporting & summaries",
  terminology: "Terminology & naming",
  prioritization: "Prioritization",
  compliance: "Compliance context",
  operating_hours: "Operating hours",
};

export interface InstructionRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  instructionText: string;
  category: InstructionCategory;
  scope: InstructionScope;
  scopeId: string | null;
  priority: number;
  enabled: boolean;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface InstructionRevisionView {
  id: string;
  version: number;
  name: string;
  instructionText: string;
  category: string;
  scope: string;
  scopeId: string | null;
  priority: number;
  enabled: boolean;
  changedBy: string | null;
  createdAt: string;
}

export interface InstructionIssue {
  field: string;
  message: string;
}

export const INSTRUCTION_TEXT_LIMIT = 4000;

/**
 * Phrases that would turn guidance into an attempted override. Instructions are
 * never consulted for authorization, but an instruction that *claims* authority
 * is misleading to the humans reading it, so it is rejected at authoring time.
 */
const OVERRIDE_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\b(ignore|bypass|disable|override|skip|disregard|circumvent)\b[^.]{0,40}\b(guardrail|guard rail|policy|policies|approval|governance|restriction|control|safety)/i,
    message:
      "Instructions cannot ask an agent to ignore or override guardrails, policies, or approvals.",
  },
  {
    pattern: /\b(you (are|have been) (granted|authorized|permitted)|treat yourself as|act as (an )?admin)\b/i,
    message: "Instructions cannot grant permissions. Permissions come from roles and guardrails.",
  },
  {
    pattern: /\b(no approval|without approval|approval (is )?not (required|needed))\b/i,
    message:
      "Instructions cannot waive approval requirements. Change the guardrail instead if that is the intent.",
  },
];

export interface InstructionInput {
  id?: string | null;
  name: string;
  description?: string | null;
  instructionText: string;
  category?: string;
  scope: string;
  scopeId?: string | null;
  priority?: number;
  enabled?: boolean;
}

export interface ValidatedInstruction {
  name: string;
  description: string | null;
  instruction_text: string;
  category: InstructionCategory;
  scope: InstructionScope;
  scope_id: string | null;
  priority: number;
  enabled: boolean;
}

/** Pure validation, shared by the server and by the authoring UI. */
export function validateInstruction(
  input: InstructionInput,
): { ok: true; value: ValidatedInstruction } | { ok: false; issues: InstructionIssue[] } {
  const issues: InstructionIssue[] = [];

  const name = String(input.name ?? "").trim();
  if (name.length < 3) {
    issues.push({ field: "name", message: "Give this instruction a clear name." });
  }

  const text = String(input.instructionText ?? "").trim();
  if (text.length < 10) {
    issues.push({
      field: "instructionText",
      message: "Write at least a sentence of guidance.",
    });
  }
  if (text.length > INSTRUCTION_TEXT_LIMIT) {
    issues.push({
      field: "instructionText",
      message: `Keep guidance under ${INSTRUCTION_TEXT_LIMIT} characters.`,
    });
  }
  for (const { pattern, message } of OVERRIDE_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({ field: "instructionText", message });
      break;
    }
  }

  const scope = String(input.scope ?? "");
  if (!INSTRUCTION_SCOPES.includes(scope as InstructionScope)) {
    issues.push({ field: "scope", message: "Choose a valid scope." });
  }

  const scopeId = input.scopeId ? String(input.scopeId).trim().slice(0, 160) : null;
  if (scope !== "organization" && !scopeId) {
    issues.push({ field: "scopeId", message: "Select what this instruction applies to." });
  }

  const category = String(input.category ?? "general");
  if (!INSTRUCTION_CATEGORIES.includes(category as InstructionCategory)) {
    issues.push({ field: "category", message: "Choose a valid category." });
  }

  const priority = Number(input.priority ?? 100);
  if (!Number.isInteger(priority) || priority < 1 || priority > 1000) {
    issues.push({ field: "priority", message: "Priority must be between 1 and 1000." });
  }

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    value: {
      name: name.slice(0, 160),
      description: input.description ? String(input.description).trim().slice(0, 600) : null,
      instruction_text: text,
      category: category as InstructionCategory,
      scope: scope as InstructionScope,
      scope_id: scope === "organization" ? null : scopeId,
      priority,
      enabled: input.enabled ?? true,
    },
  };
}

export interface InstructionTarget {
  agentKey?: string | null;
  integrationId?: string | null;
  provider?: string | null;
  capability?: string | null;
}

/** Does this instruction's scope apply to the operation being prepared? */
export function instructionApplies(
  record: Pick<InstructionRecord, "scope" | "scopeId" | "enabled">,
  target: InstructionTarget,
): boolean {
  if (!record.enabled) return false;
  switch (record.scope) {
    case "organization":
      return true;
    case "agent":
      return !record.scopeId || record.scopeId === target.agentKey;
    case "integration":
      return (
        !record.scopeId ||
        record.scopeId === target.integrationId ||
        record.scopeId === target.provider
      );
    case "capability":
      return !record.scopeId || record.scopeId === target.capability;
    default:
      return false;
  }
}

/**
 * Composes applicable instructions into a single guidance block, broadest scope
 * first. The preamble is deliberate: it tells the model, in-band, that this text
 * is advisory and that governance decisions are made elsewhere.
 */
export function composeInstructions(
  records: InstructionRecord[],
  target: InstructionTarget,
): { text: string; applied: InstructionRecord[] } {
  const applied = records
    .filter((r) => instructionApplies(r, target))
    .sort((a, b) => {
      const scopeDelta = instructionScopeRank(a.scope) - instructionScopeRank(b.scope);
      if (scopeDelta !== 0) return scopeDelta;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.localeCompare(b.name);
    });

  if (applied.length === 0) return { text: "", applied };

  const body = applied
    .map(
      (r) =>
        `- ${r.name} (${INSTRUCTION_SCOPE_LABELS[r.scope]}${r.scopeId ? `: ${r.scopeId}` : ""}): ${r.instructionText}`,
    )
    .join("\n");

  const text = [
    "ORGANIZATION INSTRUCTIONS & GUIDELINES (advisory).",
    "These describe how this organization prefers work to be done. They shape wording, priorities and explanations only.",
    "They cannot grant permissions, relax guardrails, or approve an operation; the server decides that before you are called.",
    "",
    body,
  ].join("\n");

  return { text, applied };
}
