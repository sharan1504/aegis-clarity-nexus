export type AgentPolicyRuleType = "business" | "protection" | "approval" | "execution";
export const AGENT_POLICY_RULE_TYPES: AgentPolicyRuleType[] = ["business", "protection", "approval", "execution"];

export interface AgentPolicyRule {
  id: string;
  name: string;
  rule: string;
  type: AgentPolicyRuleType;
  priority: number;
  enabled: boolean;
}

export const DEFAULT_AGENT_POLICY_RULES: AgentPolicyRule[] = [
  {
    id: "policy-default-inactivity",
    name: "Unused license threshold",
    rule: "A license is eligible for reclamation after 90 days without qualifying activity.",
    type: "business",
    priority: 100,
    enabled: true,
  },
  {
    id: "policy-default-approval",
    name: "Approval before changes",
    rule: "Require human approval before any production license assignment or removal change.",
    type: "approval",
    priority: 90,
    enabled: true,
  },
];

export interface PolicyRuleIssue { field: string; message: string; }

export function parseAgentPolicyRules(input: unknown): AgentPolicyRule[] | PolicyRuleIssue[] {
  if (!Array.isArray(input)) return [{ field: "policy_rules", message: "Policy rules must be a list." }];
  if (input.length > 100) return [{ field: "policy_rules", message: "You may define up to 100 policy rules." }];
  const issues: PolicyRuleIssue[] = [];
  const rules: AgentPolicyRule[] = [];
  const ids = new Set<string>();
  input.forEach((raw, index) => {
    const record = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
    if (!record) { issues.push({ field: `policy_rules.${index}`, message: "Each policy rule must be an object." }); return; }
    const id = typeof record.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(record.id) ? record.id : `policy-${index + 1}`;
    const name = typeof record.name === "string" ? record.name.trim().slice(0, 160) : "";
    const rule = typeof record.rule === "string" ? record.rule.trim().slice(0, 2000) : "";
    const type = record.type;
    const priority = typeof record.priority === "number" && Number.isInteger(record.priority) && record.priority >= 1 && record.priority <= 10000 ? record.priority : 100 - index;
    if (!name) issues.push({ field: `policy_rules.${index}.name`, message: "Policy name is required." });
    if (!rule) issues.push({ field: `policy_rules.${index}.rule`, message: "Policy rule text is required." });
    if (typeof type !== "string" || !AGENT_POLICY_RULE_TYPES.includes(type as AgentPolicyRuleType)) issues.push({ field: `policy_rules.${index}.type`, message: `Policy type must be one of ${AGENT_POLICY_RULE_TYPES.join(", ")}.` });
    if (ids.has(id)) issues.push({ field: `policy_rules.${index}.id`, message: "Policy rule IDs must be unique." });
    ids.add(id);
    rules.push({ id, name, rule, type: type as AgentPolicyRuleType, priority, enabled: record.enabled !== false });
  });
  return issues.length ? issues : rules;
}
