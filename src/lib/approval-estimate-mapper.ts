export function mapEstimate(row: { estimated_cost_amount?:number|null; estimated_cost_currency?:string|null; estimated_savings_amount?:number|null; estimated_downtime_minutes?:number|null }) {
  return {
    estimatedCostAmount: row.estimated_cost_amount ?? null,
    estimatedCostCurrency: row.estimated_cost_currency ?? null,
    estimatedSavingsAmount: row.estimated_savings_amount ?? null,
    estimatedDowntimeMinutes: row.estimated_downtime_minutes ?? null,
  };
}
