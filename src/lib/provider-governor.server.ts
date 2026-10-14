export interface ProviderCapacityClaim {
  acquired: boolean;
  token?: string;
  reason?: "rate_limit" | "concurrency_limit";
  retryAfterSeconds?: number;
}

export async function claimProviderSyncCapacity(
  db: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> },
  input: { tenantId: string; provider: string; connectionId: string; runId?: string | null },
): Promise<ProviderCapacityClaim> {
  const { data, error } = await db.rpc("claim_provider_sync_capacity", {
    p_tenant_id: input.tenantId,
    p_provider: input.provider,
    p_connection_id: input.connectionId,
    p_run_id: input.runId ?? null,
    p_requests_per_minute: 10,
    p_max_concurrency: 2,
    p_lease_seconds: 900,
  });
  if (error) throw new Error(`Unable to claim shared provider capacity: ${error.message}`);
  return data as ProviderCapacityClaim;
}

export async function releaseProviderSyncCapacity(
  db: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> },
  token: string,
): Promise<void> {
  const { error } = await db.rpc("release_provider_sync_capacity", { p_token: token });
  if (error) throw new Error(`Unable to release shared provider capacity: ${error.message}`);
}
