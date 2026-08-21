// Sensitive change-control actions. Every one of these writes an immutable
// audit entry and emits a tenant notification; Realtime pushes the result to
// every open client.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { writeAudit } from "@/lib/audit";
import { pushNotification } from "@/lib/realtime";
import { createExternalTicketServer } from "@/lib/integrations/external-ticket.server";
import {
  CHANGE_STAGES,
  type ChangeRecord,
  type ChangeStage,
  type ChangeTimelineEvent,
  type ExternalTicket,
} from "@/lib/change-data";

interface ActorContext {
  tenantId: string;
  actor: string;
  role: string;
}

async function appendTimeline(
  record: ChangeRecord,
  event: ChangeTimelineEvent,
  extra: { stage?: ChangeStage; externalTickets?: ExternalTicket[] } = {},
) {
  if (!record.rowId) return;
  await supabase
    .from("change_records")
    .update({
      timeline: [event, ...record.timeline] as unknown as Json,
      ...(extra.stage ? { stage: extra.stage } : {}),
      ...(extra.externalTickets ? { external_tickets: extra.externalTickets as unknown as Json } : {}),
    })
    .eq("id", record.rowId);
}

function nextStage(record: ChangeRecord, allApproved: boolean): ChangeStage | undefined {
  if (!allApproved) return undefined;
  const idx = CHANGE_STAGES.indexOf(record.stage);
  return idx >= 0 && idx < CHANGE_STAGES.length - 1 ? CHANGE_STAGES[idx + 1] : undefined;
}

/** Records an approval decision on every pending approval row of a change. */
export async function decideChange(
  record: ChangeRecord,
  decision: "approved" | "rejected",
  ctx: ActorContext,
  comment?: string,
) {
  const now = new Date().toISOString();
  const pending = record.approvals.filter((a) => a.status === "pending" && a.rowId);
  const ids = pending.map((a) => a.rowId!) as string[];

  if (ids.length) {
    const { error } = await supabase
      .from("change_approvals")
      .update({
        status: decision,
        decided_at: now,
        comment: comment ?? `${decision === "approved" ? "Approved" : "Rejected"} by ${ctx.actor} (${ctx.role})`,
      })
      .in("id", ids);
    if (error) throw error;
  }

  const allApproved = decision === "approved";
  const stage = nextStage(record, allApproved);
  await appendTimeline(
    record,
    {
      ts: now,
      actor: ctx.actor,
      kind: "status",
      text:
        decision === "approved"
          ? `Approval recorded by ${ctx.actor} (${ctx.role}).${stage ? ` Stage advanced to ${stage}.` : ""}`
          : `Change rejected by ${ctx.actor} (${ctx.role}).`,
    },
    { stage },
  );

  await writeAudit({
    tenantId: ctx.tenantId,
    action: decision === "approved" ? "change.approved" : "change.rejected",
    entityType: "change_record",
    entityId: record.id,
    actorRole: ctx.role,
    detail: `${record.title} — ${decision} (${ids.length} approval row(s))`,
    payload: {
      changeId: record.id,
      risk: record.risk.tier,
      executionMode: record.executionMode,
      approvalsDecided: pending.map((a) => a.team),
      comment: comment ?? null,
    },
  });

  await pushNotification({
    tenantId: ctx.tenantId,
    kind: "approval_deadline",
    title: `${record.id} ${decision}`,
    body: `${record.title} — ${decision} by ${ctx.actor} (${ctx.role}).`,
    href: `/approvals/${record.id}`,
  });
}

export async function bulkDecideChanges(
  records: ChangeRecord[],
  decision: "approved" | "rejected",
  ctx: ActorContext,
) {
  for (const record of records) {
    await decideChange(record, decision, ctx, `Bulk ${decision} by ${ctx.actor} (${ctx.role})`);
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    action: decision === "approved" ? "change.bulk_approved" : "change.bulk_rejected",
    entityType: "change_record",
    actorRole: ctx.role,
    detail: `Bulk ${decision} of ${records.length} change record(s)`,
    payload: { changeIds: records.map((r) => r.id) },
  });
}

/** Initiates the documented rollback plan for an executed change. */
export async function initiateRollback(record: ChangeRecord, ctx: ActorContext) {
  const now = new Date().toISOString();
  await appendTimeline(record, {
    ts: now,
    actor: ctx.actor,
    kind: "rollback",
    text: `Rollback initiated by ${ctx.actor} (${ctx.role}).`,
  });

  await writeAudit({
    tenantId: ctx.tenantId,
    action: "change.rollback_initiated",
    entityType: "change_record",
    entityId: record.id,
    actorRole: ctx.role,
    detail: `${record.title} — rollback initiated`,
    payload: { changeId: record.id, executionMode: record.executionMode },
  });

  return { ok: true };
}

/** Creates an external ticket through the existing connector path. */
export async function createExternalTicket(
  record: ChangeRecord,
  ctx: ActorContext,
  provider: "jira" | "servicenow",
) {
  const ticket = await createExternalTicketServer({
    tenantId: ctx.tenantId,
    provider,
    title: record.title,
    description: record.businessImpact ?? record.aiReasoning ?? "Aegis change record",
    changeId: record.id,
  });

  const tickets = [...record.externalTickets, ticket];
  await appendTimeline(
    record,
    {
      ts: new Date().toISOString(),
      actor: ctx.actor,
      kind: "ticket",
      text: `${provider} ticket ${ticket.key} created for ${record.id}.`,
    },
    { externalTickets: tickets },
  );

  await writeAudit({
    tenantId: ctx.tenantId,
    action: "ticket.created",
    entityType: "change_record",
    entityId: record.id,
    actorRole: ctx.role,
    detail: `${provider} ticket ${ticket.key} created`,
    payload: { changeId: record.id, provider, ticketKey: ticket.key },
  });

  return ticket;
}
