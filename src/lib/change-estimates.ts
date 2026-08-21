export type ProviderEstimate = {
  costAmount: number | null;
  savingsAmount: number | null;
  currency: string | null;
  downtimeMinutes: number | null;
};

/** Only accepts explicit provider-derived numbers. No heuristics or defaults. */
export function normalizeProviderEstimate(input: Partial<ProviderEstimate>): ProviderEstimate {
  return {
    costAmount: typeof input.costAmount === 'number' && Number.isFinite(input.costAmount) && input.costAmount >= 0 ? input.costAmount : null,
    savingsAmount: typeof input.savingsAmount === 'number' && Number.isFinite(input.savingsAmount) && input.savingsAmount >= 0 ? input.savingsAmount : null,
    currency: typeof input.currency === 'string' && input.currency.trim() ? input.currency : null,
    downtimeMinutes: typeof input.downtimeMinutes === 'number' && Number.isInteger(input.downtimeMinutes) && input.downtimeMinutes >= 0 ? input.downtimeMinutes : null,
  };
}
