export function getSyncFailureState(runs: Array<{ status?: string | null }>, threshold = 3) {
  let failureStreak = 0;
  for (const run of runs) {
    if (run.status !== "failed") break;
    failureStreak += 1;
    if (failureStreak >= threshold) break;
  }
  return { failureStreak, degraded: failureStreak >= threshold };
}
