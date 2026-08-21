/**
 * Pure query helpers for the audit stream: filtering, stats, severity/status
 * mapping and CSV serialization. Kept free of React and of any data source so
 * the same logic can run server-side for a future streamed export.
 */
import type {
  AuditEvent,
  AuditFilters,
  AuditResult,
  AuditRisk,
  AuditStats,
} from "./types";
import { ACTION_LABELS, RESOURCE_LABELS } from "./types";

export function rangeStart(
  filters: AuditFilters,
  now: Date = new Date(),
): Date | null {
  switch (filters.range ?? "30d") {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7d":
      return new Date(now.getTime() - 7 * 86_400_000);
    case "30d":
      return new Date(now.getTime() - 30 * 86_400_000);
    case "custom":
      return filters.from ? new Date(filters.from) : null;
    default:
      return null;
  }
}

function rangeEnd(filters: AuditFilters): Date | null {
  if (filters.range === "custom" && filters.to) {
    const d = new Date(filters.to);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  return null;
}

function matchesSearch(event: AuditEvent, term: string): boolean {
  const haystack = [
    event.id,
    event.correlationId,
    event.actor.name,
    event.actor.email,
    ACTION_LABELS[event.action],
    event.action,
    event.resourceName,
    RESOURCE_LABELS[event.resourceType],
    event.targetId ?? "",
    event.integration ?? "",
    event.agent ?? "",
    event.reason ?? "",
    event.approvalId ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term.trim().toLowerCase());
}

const isAll = (value: string | undefined | null) => !value || value === "all";

export function filterEvents(
  events: AuditEvent[],
  filters: AuditFilters,
  now: Date = new Date(),
): AuditEvent[] {
  const from = rangeStart(filters, now);
  const to = rangeEnd(filters);

  return events
    .filter((event) => {
      const ts = new Date(event.timestamp);
      if (from && ts < from) return false;
      if (to && ts > to) return false;
      if (filters.search && !matchesSearch(event, filters.search)) return false;
      if (!isAll(filters.actorId) && event.actor.id !== filters.actorId) return false;
      if (!isAll(filters.action) && event.action !== filters.action) return false;
      if (!isAll(filters.resourceType) && event.resourceType !== filters.resourceType) return false;
      if (!isAll(filters.integration) && event.integration !== filters.integration) return false;
      if (!isAll(filters.agent) && event.agent !== filters.agent) return false;
      if (!isAll(filters.result) && event.result !== filters.result) return false;
      if (!isAll(filters.risk) && event.risk !== filters.risk) return false;
      if (!isAll(filters.role) && event.actor.role !== filters.role) return false;
      if (
        !isAll(filters.approvalStatus) &&
        (event.approvalStatus ?? "not_required") !== filters.approvalStatus
      )
        return false;
      if (filters.correlationId && event.correlationId !== filters.correlationId) return false;
      return true;
    })
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export function computeStats(events: AuditEvent[], now: Date = new Date()): AuditStats {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  return {
    total: events.length,
    today: events.filter((e) => new Date(e.timestamp) >= startOfDay).length,
    highRisk: events.filter((e) => e.risk === "critical" || e.risk === "high").length,
    failed: events.filter((e) => e.result === "failure").length,
  };
}

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function resultTone(result: AuditResult): Tone {
  switch (result) {
    case "success":
      return "success";
    case "failure":
      return "danger";
    case "warning":
      return "warning";
    case "pending":
      return "info";
    default:
      return "neutral";
  }
}

export function riskTone(risk: AuditRisk): Tone {
  switch (risk) {
    case "critical":
      return "danger";
    case "high":
      return "warning";
    case "medium":
      return "info";
    default:
      return "neutral";
  }
}

/** True when a row deserves the emphasized "needs attention" treatment. */
export function isAttentionEvent(event: AuditEvent): boolean {
  return event.result === "failure" || event.risk === "critical" || event.risk === "high";
}

export function relatedEvents(events: AuditEvent[], event: AuditEvent): AuditEvent[] {
  return events
    .filter((e) => e.correlationId === event.correlationId && e.id !== event.id)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
}

const CSV_COLUMNS = [
  "event_id",
  "correlation_id",
  "timestamp",
  "actor_name",
  "actor_email",
  "actor_role",
  "action",
  "resource_type",
  "resource_name",
  "target_id",
  "integration",
  "agent",
  "result",
  "risk",
  "approval_id",
  "approval_status",
  "source_channel",
  "source_ip",
  "reason",
  "changes",
] as const;

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serializes already-redacted events. Never call with raw repository rows. */
export function toCsv(events: AuditEvent[]): string {
  const rows = events.map((e) =>
    [
      e.id,
      e.correlationId,
      e.timestamp,
      e.actor.name,
      e.actor.email,
      e.actor.role,
      ACTION_LABELS[e.action],
      RESOURCE_LABELS[e.resourceType],
      e.resourceName,
      e.targetId,
      e.integration,
      e.agent,
      e.result,
      e.risk,
      e.approvalId,
      e.approvalStatus ?? "not_required",
      e.source.channel,
      e.source.ip,
      e.reason,
      e.changes.map((c) => `${c.field}: ${c.oldValue ?? "—"} -> ${c.newValue ?? "—"}`).join("; "),
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}
