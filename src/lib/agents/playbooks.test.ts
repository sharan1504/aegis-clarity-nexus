import { describe, expect, it } from "vitest";
import { AGENT_PLAYBOOK_KEYS, AGENT_PLAYBOOKS, getAgentPlaybook } from "./playbooks";

describe("agent playbooks", () => {
  it("covers every production agent definition currently supported", () => {
    expect(AGENT_PLAYBOOK_KEYS).toEqual(expect.arrayContaining([
      "agent-license",
      "agent-cost",
      "agent-security",
      "agent-incident",
      "agent-ccx",
      "agent-workflow",
      "agent-knowledge",
      "agent-productivity",
    ]));
    expect(AGENT_PLAYBOOK_KEYS).toHaveLength(8);
  });

  it("requires evidence and explicit data gaps for every playbook", () => {
    for (const playbook of Object.values(AGENT_PLAYBOOKS)) {
      expect(playbook.outputContract.requiresEvidence).toBe(true);
      expect(playbook.outputContract.dataGapsRequired).toBe(true);
      expect(playbook.investigationPlaybook.length).toBeGreaterThan(0);
    }
  });

  it("does not treat providers as mandatory for domain execution", () => {
    expect(getAgentPlaybook("agent-security").preferredProviders).toContain("rubrik");
    expect(getAgentPlaybook("agent-security").requiredCapabilities).toContain("security_findings");
  });
});
