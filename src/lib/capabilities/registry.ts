import type { JsonValue } from "@/lib/json";
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
  | "repo_inventory"
  | "security_findings";

export interface CapabilityDef { id: string; key: string; displayName: string; description: string | null; category: string; readOnly: boolean; writeCapable: boolean; }
export const PROVIDER_LABELS: Record<string, { name: string; logo: string; category: string }> = {
  genesys: { name: "Genesys Cloud", logo: "🎧", category: "Contact Center" }, github: { name: "GitHub", logo: "◉", category: "Developer Platform" }, microsoft365: { name: "Microsoft 365", logo: "🪟", category: "Productivity" }, aws: { name: "AWS", logo: "☁️", category: "Cloud" }, azure: { name: "Microsoft Azure", logo: "🔷", category: "Cloud" }, salesforce: { name: "Salesforce", logo: "☁︎", category: "CRM" }, servicenow: { name: "ServiceNow", logo: "🛎️", category: "ITSM" }, jira: { name: "Jira", logo: "🧩", category: "ITSM" }, okta: { name: "Okta", logo: "🔐", category: "Identity" },
};
export function providerLabel(provider: string) { return PROVIDER_LABELS[provider] ?? { name: provider, logo: "🔌", category: "Integration" }; }
export type DataSourceState = "active" | "connected_not_bound" | "unhealthy" | "stale" | "capability_unavailable" | "not_connected";
export const DATA_SOURCE_STATE_LABELS: Record<DataSourceState, string> = { active: "Active data source.", connected_not_bound: "Connected — not enabled for this agent.", unhealthy: "Connection requires attention.", stale: "Data source requires synchronization.", capability_unavailable: "This provider does not currently support this capability.", not_connected: "Connect an integration to use this agent." };
export interface RecordProvenance { provider: string; integrationId: string; sourceSystem: string; source: string; snapshotId: string | null; syncId: string | null; dataAsOf: string | null; lastSuccessfulSyncAt: string | null; freshness: FreshnessState; }
export interface NormalizedEntitlement { provider: string; integrationId: string; userId: string; userName: string | null; userEmail: string | null; entitlementId: string; entitlementName: string | null; status: "active" | "inactive" | "unknown"; lastActivityAt: string | null; metadata: Record<string, JsonValue>; provenance: RecordProvenance; }
export interface NormalizedUser { provider: string; integrationId: string; userId: string; userName: string | null; userEmail: string | null; status: string | null; lastActivityAt: string | null; metadata: Record<string, JsonValue>; provenance: RecordProvenance; }
export interface NormalizedQueue { provider: string; integrationId: string; queueId: string; queueName: string | null; memberCount: number | null; metadata: Record<string, JsonValue>; provenance: RecordProvenance; }
export type NormalizedFindingSeverity = "low" | "medium" | "high" | "critical" | "unknown";
export interface NormalizedRepository { provider: string; integrationId: string; repositoryId: string; repositoryName: string; url: string | null; private: boolean | null; archived: boolean | null; defaultBranch: string | null; pushedAt: string | null; providerUpdatedAt: string | null; metadata: Record<string, JsonValue>; provenance: RecordProvenance; }
export interface NormalizedSecurityFinding { provider: string; integrationId: string; findingId: string; repositoryName: string | null; findingType: string; title: string | null; severity: NormalizedFindingSeverity; state: string | null; url: string | null; providerUpdatedAt: string | null; metadata: Record<string, JsonValue>; provenance: RecordProvenance; }
export interface CapabilitySource { integrationId: string; provider: string; displayName: string; implemented: boolean; recordCount: number; lastSyncAt: string | null; snapshotId: string | null; freshness: FreshnessState; freshnessAgeMs: number | null; policyVersion: number | null; warning?: string; }
export interface CapabilityResult<T> { capability: CapabilityKey; tenantId: string; agentKey: string; records: T[]; sources: CapabilitySource[]; warnings: string[]; evaluatedAt: string; freshness: FreshnessState; }
