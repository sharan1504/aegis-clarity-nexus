// Provider-neutral entities shared by Aegis agents.
// Connectors map provider payloads into these shapes; agents never need to know
// provider-specific API structures.

export interface AegisUser {
  tenantId: string;
  externalId: string;
  name: string | null;
  email: string | null;
  status: string | null;
  metadata?: Record<string, unknown>;
}

export interface AegisLicense {
  tenantId: string;
  externalId: string;
  name: string | null;
  status: string | null;
  metadata?: Record<string, unknown>;
}

export interface AegisAssignment {
  tenantId: string;
  userExternalId: string;
  licenseExternalId: string;
  status: string | null;
  assignedAt?: string | null;
  lastActivityAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AegisSnapshotMetadata {
  tenantId: string;
  connector: string;
  dataVersion: string;
  syncedAt: string;
  lastSuccessfulSyncAt: string;
  recordCount: number;
  freshness: "fresh" | "stale" | "unavailable";
}
