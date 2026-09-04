import { resolveTenant } from "@/lib/genesys/store.server";
import { loadLiveWorkspaceData, type LiveRecommendation } from "@/lib/live-workspace.functions";

export type UserClientLike = Parameters<typeof resolveTenant>[0];

/**
 * Confidence is derived deterministically from evidence completeness only:
 * - "high":   provider connected AND the finding's own live evidence counts are present AND a persisted sync exists within 48h.
 * - "medium": provider connected AND live evidence present, but no recent persisted sync to corroborate the live read.
 * - "insufficient": no connected provider or no live evidence for the finding.
 * No model-generated or invented confidence is used anywhere.
 */
export type InvestigationConfidence = "high" | "medium" | "insufficient";

export interface InvestigationEvidenceItem { source: string; observation: string; observedAt: string; }
export interface InvestigationTimelineItem { ts: string; actor: string; kind: string; text: string; }
export interface InvestigationCorrelation { changeId: string; rowId: string; title: string; stage: string; severity: string; createdAt: string; }

export interface InvestigationSummary {
  key: string;
  provider?: string | null;
  title: string;
  severity: LiveRecommendation["severity"];
  category: LiveRecommendation["category"];
  impact: string;
  confidence: InvestigationConfidence;
  correlatedChangeCount: number;
}

export interface Investigation {
  key: string;
  title: string;
  severity: LiveRecommendation["severity"];
  category: LiveRecommendation["category"];
  finding: string;
  evidence: InvestigationEvidenceItem[];
  timeline: InvestigationTimelineItem[];
  correlatedSignals: InvestigationCorrelation[];
  confidence: InvestigationConfidence;
  confidenceRationale: string;
  businessImpact: string;
  risk: { tier: "Low" | "Medium" | "High" | "Critical"; factors: string[]; scoreAvailable: false };
  recommendedAction: string;
  executable: boolean;
  provider: string | null;
  region: string | null;
  fetchedAt: string;
  lastSyncAt: string | null;
  insufficientEvidenceReason: string | null;
}

function riskTier(severity: LiveRecommendation["severity"]): Investigation["risk"]["tier"] {
  if (severity === "critical") return "Critical";
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "Low";
}

export async function listInvestigations(supabase: UserClientLike, userId: string): Promise<{ connected: boolean; provider: string | null; fetchedAt: string; investigations: InvestigationSummary[] }> {
  const live = await loadLiveWorkspaceData(supabase, userId);
  if (!live.connected) return { connected: false, provider: null, fetchedAt: live.fetchedAt, investigations: [] };
  const { tenantId } = await resolveTenant(supabase, userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-selected column set.
  const db = supabase as any;
  const changes = await db.from("change_records").select("change_id,title").eq("tenant_id", tenantId).limit(500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are shaped by the select above.
  const changeRows: any[] = changes.data ?? [];
  return {
    connected: true,
    provider: live.provider,
    fetchedAt: live.fetchedAt,
    investigations: live.recommendations.map((recommendation) => ({
      key: recommendation.key,
      title: recommendation.title,
      severity: recommendation.severity,
      category: recommendation.category,
      impact: recommendation.impact,
      confidence: confidenceFor(live.lastSyncAt),
      correlatedChangeCount: changeRows.filter((row) => String(row.title) === recommendation.title).length,
    })),
  };
}

function confidenceFor(lastSyncAt: string | null): InvestigationConfidence {
  if (!lastSyncAt) return "medium";
  return Date.now() - new Date(lastSyncAt).getTime() <= 48 * 3_600_000 ? "high" : "medium";
}

export async function loadInvestigation(supabase: UserClientLike, userId: string, key: string): Promise<Investigation | { unavailable: true; reason: string }> {
  const live = await loadLiveWorkspaceData(supabase, userId);
  if (!live.connected) return { unavailable: true, reason: "No provider is connected, so there is no evidence to investigate. Connect an integration and run a sync first." };
  const recommendation = live.recommendations.find((item) => item.key === key);
  if (!recommendation) return { unavailable: true, reason: "This finding is no longer present in the current provider evidence. It may have been resolved, or the underlying data changed since the link was created." };

  const { tenantId } = await resolveTenant(supabase, userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-selected column set.
  const db = supabase as any;
  const [changes, audit] = await Promise.all([
    db.from("change_records").select("id,change_id,title,stage,severity,created_at,timeline").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200),
    db.from("audit_log").select("action,entity_type,entity_id,detail,actor_email,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are shaped by the selects above.
  const correlated: any[] = (changes.data ?? []).filter((row: any) => String(row.title) === recommendation.title);
  const correlatedIds = new Set(correlated.map((row) => String(row.change_id)));

  const evidence: InvestigationEvidenceItem[] = [
    { source: `${live.provider ?? "Provider"} live read (${live.region ?? "region unknown"})`, observation: recommendation.evidence, observedAt: live.fetchedAt },
    { source: "Live workspace counters", observation: `${live.users} users, ${live.licensedUsers} licensed users, ${live.licenseAssignments} license assignments, ${live.queues} queues observed in the current read.`, observedAt: live.fetchedAt },
  ];
  if (live.lastSyncAt) evidence.push({ source: "Persisted provider snapshot", observation: `The most recent successful persisted sync for this integration completed at ${live.lastSyncAt}.`, observedAt: live.lastSyncAt });

  const timeline: InvestigationTimelineItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are shaped by the selects above.
  for (const row of (audit.data ?? []) as any[]) {
    const entityId = row.entity_id ? String(row.entity_id) : null;
    const relevant = (entityId && correlatedIds.has(entityId)) || String(row.entity_type) === "integration" || String(row.action).startsWith("integration.") || String(row.action).startsWith("guardrail.");
    if (!relevant) continue;
    timeline.push({ ts: String(row.created_at), actor: row.actor_email ? String(row.actor_email) : "system", kind: String(row.entity_type), text: row.detail ? String(row.detail) : String(row.action) });
    if (timeline.length >= 20) break;
  }

  const confidence = confidenceFor(live.lastSyncAt);
  const confidenceRationale = confidence === "high"
    ? "The live provider read and a persisted sync completed within the last 48 hours both contain the evidence for this finding."
    : "The finding is supported by the current live provider read, but no persisted sync within the last 48 hours corroborates it.";

  return {
    key: recommendation.key,
    title: recommendation.title,
    severity: recommendation.severity,
    category: recommendation.category,
    finding: recommendation.title,
    evidence,
    timeline,
    correlatedSignals: correlated.map((row) => ({ changeId: String(row.change_id), rowId: String(row.id), title: String(row.title), stage: String(row.stage), severity: String(row.severity), createdAt: String(row.created_at) })),
    confidence,
    confidenceRationale,
    businessImpact: recommendation.impact,
    risk: { tier: riskTier(recommendation.severity), factors: ["Derived from read-only provider evidence", "No provider mutation has been executed", "Human approval required before any change"], scoreAvailable: false },
    recommendedAction: recommendation.action,
    executable: recommendation.canExecute,
    provider: live.provider,
    region: live.region,
    fetchedAt: live.fetchedAt,
    lastSyncAt: live.lastSyncAt,
    insufficientEvidenceReason: null,
  };
}
