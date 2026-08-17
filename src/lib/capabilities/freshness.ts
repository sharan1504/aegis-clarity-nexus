// Data freshness vocabulary. Client-safe and provider-neutral.
//
// Freshness is a FACT about synchronization age, not a business decision.
// Agents may refuse to act on stale data, but that refusal is policy/guardrail
// work — this module only reports the state.

export type FreshnessState = "fresh" | "aging" | "stale" | "unavailable";

export const FRESHNESS_THRESHOLDS = {
  /** Up to 1 hour old -> fresh. */
  freshMs: 60 * 60 * 1000,
  /** Up to 8 hours old -> aging. */
  agingMs: 8 * 60 * 60 * 1000,
} as const;

export const FRESHNESS_LABELS: Record<FreshnessState, string> = {
  fresh: "Fresh",
  aging: "Aging",
  stale: "Stale",
  unavailable: "Never synchronized",
};

export interface FreshnessInfo {
  state: FreshnessState;
  ageMs: number | null;
  lastSuccessfulSyncAt: string | null;
  /** Human-readable relative age, e.g. "12 minutes ago". */
  ageLabel: string;
}

const FRESHNESS_ORDER: Record<FreshnessState, number> = {
  fresh: 0,
  aging: 1,
  stale: 2,
  unavailable: 3,
};

export function relativeAgeLabel(ageMs: number | null): string {
  if (ageMs === null) return "never";
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function evaluateFreshness(
  lastSuccessfulSyncAt: string | null | undefined,
  now: number = Date.now(),
): FreshnessInfo {
  if (!lastSuccessfulSyncAt) {
    return { state: "unavailable", ageMs: null, lastSuccessfulSyncAt: null, ageLabel: "never" };
  }

  const ts = new Date(lastSuccessfulSyncAt).getTime();
  if (Number.isNaN(ts)) {
    return { state: "unavailable", ageMs: null, lastSuccessfulSyncAt: null, ageLabel: "never" };
  }

  const ageMs = Math.max(0, now - ts);
  const state: FreshnessState =
    ageMs <= FRESHNESS_THRESHOLDS.freshMs
      ? "fresh"
      : ageMs <= FRESHNESS_THRESHOLDS.agingMs
        ? "aging"
        : "stale";

  return {
    state,
    ageMs,
    lastSuccessfulSyncAt,
    ageLabel: relativeAgeLabel(ageMs),
  };
}

/** Worst (least fresh) state across a set of sources. */
export function worstFreshness(states: FreshnessState[]): FreshnessState {
  if (!states.length) return "unavailable";
  return states.reduce((worst, s) => (FRESHNESS_ORDER[s] > FRESHNESS_ORDER[worst] ? s : worst));
}
