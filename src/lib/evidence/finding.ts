export type SharedFindingSeverity = "Critical" | "High" | "Medium" | "Low";

export interface SharedFinding {
  id: string;
  title: string;
  severity: SharedFindingSeverity;
  category: string;
  impact: string;
  evidenceRefs: string[];
  confidence: number;
  href: string;
  freshness: string;
}

/** Build a finding only from supplied evidence; this helper never invents evidence. */
export function toSharedFinding(input: Omit<SharedFinding, "evidenceRefs"> & { evidenceRefs?: string[] }): SharedFinding {
  return { ...input, evidenceRefs: input.evidenceRefs ?? [] };
}

export function hasFindingEvidence(finding: SharedFinding): boolean {
  return finding.evidenceRefs.length > 0;
}
