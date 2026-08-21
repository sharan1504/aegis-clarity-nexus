export type SyncSchedule = { enabled:boolean; intervalMinutes:number; lastAttemptedAt:string|null; lastSucceededAt:string|null; lastFailedAt:string|null; lastError:string|null };

export function syncStatus(schedule: SyncSchedule) {
  if (!schedule.lastAttemptedAt) return 'Never run';
  if (schedule.lastError) return 'Failed';
  if (schedule.lastSucceededAt) return 'Healthy';
  return 'Running';
}
