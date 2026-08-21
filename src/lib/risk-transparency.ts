export type RiskFactor = {
  key: string;
  label: string;
  weight: number;
  contribution: number;
  evidence?: string;
};

export type TransparentRisk = { tier: 'Low'|'Medium'|'High'|'Critical'; score: number; factors: string[]; breakdown: RiskFactor[] };

/**
 * Normalizes the server-computed risk payload for UI consumption. It never
 * derives a new explanation from the score on the client.
 */
export function getRiskBreakdown(risk: unknown): RiskFactor[] {
  if (!risk || typeof risk !== 'object') return [];
  const breakdown = (risk as { breakdown?: unknown }).breakdown;
  if (!Array.isArray(breakdown)) return [];
  return breakdown.filter((f): f is RiskFactor => {
    if (!f || typeof f !== 'object') return false;
    const x = f as Record<string, unknown>;
    return typeof x.key === 'string' && typeof x.label === 'string' && typeof x.weight === 'number' && typeof x.contribution === 'number';
  });
}
