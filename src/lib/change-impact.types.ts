import type { ChangeRecord } from "@/lib/change-data";

declare module "@/lib/change-data" {
  interface ChangeRecord {
    estimatedCostAmount?: number | null;
    estimatedCostCurrency?: string | null;
    estimatedSavingsAmount?: number | null;
    estimatedDowntimeMinutes?: number | null;
  }
}

export type ChangeImpact = Pick<ChangeRecord, "estimatedCostAmount" | "estimatedCostCurrency" | "estimatedSavingsAmount" | "estimatedDowntimeMinutes">;
