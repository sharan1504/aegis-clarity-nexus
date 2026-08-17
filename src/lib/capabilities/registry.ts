// Provider-agnostic capability registry types and normalized data contracts.
// Client-safe: no credentials, no provider SDKs, no server-only imports.
//
// ARCHITECTURAL RULE
// These contracts carry FACTS ONLY. No field here may express a business
// conclusion ("optimization candidate", "inactive per policy", "recommended
// for removal"). Interpretation belongs to the policy engine and the agent.

import type { FreshnessState } from "./freshness";

export type CapabilityKey =
  | "license_inventory"
  | "user_inventory"
  | "queue_inventory"
  | "routing_inventory"
  | "presence_inventory"
  | "cloud_resource_inventory"
  | "cost_inventory"
  | "security_findings";

export interface CapabilityDef {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  category: string;
  readOnly: boolean;
  writeCapable: boolean;
}

/** Presentation metadata for providers. Adding a provider never touches agent logic. */
export const PROVIDER_LABELS: Record<string, { name: string; logo: string; category: string }> = {
  genesys: { name: "Genesys Cloud", logo: "🎧", category: "Contact Center" },
  microsoft365: { name: "Microsoft 365", logo: "🪟", category: "Productivity" },
  aws: { name: "AWS", logo: "☁️", category: "Cloud" },
  azure: { name: "Microsoft Azure", logo: "🔷", category: "Cloud" },
  salesforce: { name: "Salesforce", logo: "☁︎", category: "CRM" },
  servicenow: { name: "ServiceNow", logo: "🛎️", category: "ITSM" },
  jira: { name: "Jira", logo: "🧩", category: "ITSM" },
  okta: { name: "Okta", logo: "🔐", category: "Identity" },
};

export function providerLabel(provider: string) {
  return (
    PROVIDER_LABELS[provider] ?? {
      name: provider,
      logo: "🔌",
      category: "Integration",
    }
  );
}

/** UI state vocabulary for a data source on an agent. */
export type DataSourceState =
  | "active"
  | "connected_not_bound"
  | "unhealthy"
  | "stale"
  | "capability_unavailable"
  | "not_connected";

export const DATA_SOURCE_STATE_LABELS: Record<DataSourceState, string> = {
  active: "Active data source.",
  connected_not_bound: "Connected — not enabled for this agent.",
  unhealthy: "Connection requires attention.",
  stale: "Data source requires synchronization.",
  capability_unavailable: "This provider does not currently support this capability.",
  not_connected: "Connect an integration to use this agent.",
};

// ---------------------------------------------------------------------------
// Provenance
// Every normalized record must be traceable to the exact system, snapshot and
// point in time it came from, so a future agent can answer "where did this
// come from?" and "when was it last synchronized?".
// ---------------------------------------------------------------------------

export interface RecordProvenance {
  /** Connector/provider key, e.g. "genesys". */
  provider: string;
  /** Tenant-scoped integration row the record was read through. */
  integrationId: string;
  /** Logical source system name shown to humans. */
  sourceSystem: string;
  /** Physical record source, e.g. a normalized store name. */
  source: string;
  /** Snapshot the record belongs to, when the provider is snapshot-versioned. */
  snapshotId: string | null;
  /** Sync run that produced the record. */
  syncId: string | null;
  /** Timestamp of the data itself (when it was observed/synced). */
  dataAsOf: string | null;
  /** Last successful synchronization for the integration. */
  lastSuccessfulSyncAt: string | null;
  /** Derived freshness of the underlying data. */
  freshness: FreshnessState;
}

// ---------------------------------------------------------------------------
// Normalized (provider-neutral) data contracts
// Provider implementations map vendor payloads into these shapes. Anything
// vendor-specific belongs in `metadata`, never as a top-level field.
// ---------------------------------------------------------------------------

export interface NormalizedEntitlement {
  provider: string;
  integrationId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  entitlementId: string;
  entitlementName: string | null;
  /**
   * Factual account state as reported by the provider — NOT a policy verdict.
   * "active"/"inactive" here mirrors the provider's own account state field.
   */
  status: "active" | "inactive" | "unknown";
  /** Last activity the provider itself reports. Interpretation is policy work. */
  lastActivityAt: string | null;
  metadata: Record<string, unknown>;
  provenance: RecordProvenance;
}

export interface NormalizedUser {
  provider: string;
  integrationId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  status: string | null;
  lastActivityAt: string | null;
  metadata: Record<string, unknown>;
  provenance: RecordProvenance;
}

export interface NormalizedQueue {
  provider: string;
  integrationId: string;
  queueId: string;
  queueName: string | null;
  memberCount: number | null;
  metadata: Record<string, unknown>;
  provenance: RecordProvenance;
}

/** Per-source reporting inside a capability result. */
export interface CapabilitySource {
  integrationId: string;
  provider: string;
  displayName: string;
  implemented: boolean;
  recordCount: number;
  lastSyncAt: string | null;
  snapshotId: string | null;
  freshness: FreshnessState;
  freshnessAgeMs: number | null;
  /** Policy version in force for this integration + capability binding. */
  policyVersion: number | null;
  warning?: string;
}

/** Result envelope returned by the capability router for every capability call. */
export interface CapabilityResult<T> {
  capability: CapabilityKey;
  /** Tenant resolved server-side from the verified session — never from input. */
  tenantId: string;
  agentKey: string;
  records: T[];
  sources: CapabilitySource[];
  warnings: string[];
  /** When the router executed the read. */
  evaluatedAt: string;
  /** Worst freshness across contributing sources — the result's own freshness. */
  freshness: FreshnessState;
}
