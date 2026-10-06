export interface CorrelatedSignal {
  title: string;
  detail: string;
  providers: string[];
  timestamp: string;
  evidence: Array<{ provider: string; entityType: string; entityKey: string; observedAt: string }>;
}

const CORRELATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const TIMESTAMP_FIELDS = ["pushedAt", "updatedAt", "updated", "createdAt", "created", "snapshotAt", "occurredAt", "eventAt", "timestamp"] as const;

function entityTimestamp(entity: any): number | null {
  for (const field of TIMESTAMP_FIELDS) {
    const value = entity?.payload?.[field];
    if (typeof value !== "string" && typeof value !== "number") continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function entityLabel(entity: any): string {
  return String(entity?.payload?.key ?? entity?.payload?.name ?? entity?.payload?.fullName ?? entity?.payload?.summary ?? entity?.entity_key ?? "entity");
}

function providerLabel(provider: string): string {
  if (provider === "github") return "GitHub";
  return provider.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function normalizeProviderReportEntities(genericEntities: any[], githubEntities: any[]) {
  const normalizedGitHubEntities = githubEntities.map((row: any) => ({
    provider: "github",
    connection_id: row.connection_id,
    entity_type: row.entity_type,
    entity_key: row.entity_key,
    payload: row.payload,
    observed_at: row.synced_at,
  }));
  return [...genericEntities, ...normalizedGitHubEntities];
}

export function deriveCorrelatedSignals(entities: any[]): CorrelatedSignal[] {
  const byProvider = new Map<string, any[]>();
  for (const entity of entities) {
    if (!entity?.provider || entityTimestamp(entity) === null) continue;
    const bucket = byProvider.get(entity.provider) ?? [];
    bucket.push(entity);
    byProvider.set(entity.provider, bucket);
  }

  const providers = [...byProvider.keys()].sort();
  const signals: CorrelatedSignal[] = [];

  for (let leftIndex = 0; leftIndex < providers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < providers.length; rightIndex += 1) {
      const leftProvider = providers[leftIndex];
      const rightProvider = providers[rightIndex];
      for (const left of byProvider.get(leftProvider) ?? []) {
        const leftAt = entityTimestamp(left);
        if (leftAt === null) continue;
        for (const right of byProvider.get(rightProvider) ?? []) {
          const rightAt = entityTimestamp(right);
          if (rightAt === null || Math.abs(leftAt - rightAt) > CORRELATION_WINDOW_MS) continue;
          const leftLabel = entityLabel(left);
          const rightLabel = entityLabel(right);
          const leftName = providerLabel(leftProvider);
          const rightName = providerLabel(rightProvider);
          signals.push({
            title: `${leftName} activity aligns temporally with ${rightName} ${rightLabel}`,
            detail: `${leftName} entity ${leftLabel} was observed near the timestamp associated with ${rightName} entity ${rightLabel}. This is a temporal correlation only; CenOps does not infer causation.`,
            providers: [leftName, rightName],
            timestamp: new Date(Math.max(leftAt, rightAt)).toISOString(),
            evidence: [
              { provider: leftProvider, entityType: left.entity_type, entityKey: left.entity_key, observedAt: left.observed_at },
              { provider: rightProvider, entityType: right.entity_type, entityKey: right.entity_key, observedAt: right.observed_at },
            ],
          });
          if (signals.length >= 10) return signals;
        }
      }
    }
  }
  return signals;
}