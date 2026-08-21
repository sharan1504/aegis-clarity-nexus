/**
 * Audit repository abstraction.
 *
 * The UI depends ONLY on `AuditRepository`. Today it is backed by the in-memory
 * demo dataset; a future `SupabaseAuditRepository` can implement the same
 * interface over the sealed `audit_log` table (or a dedicated audit_events
 * table) without any UI change. `record()` is the single write entry point that
 * connectors, agents and the change engine will use.
 */
import { computeStats, filterEvents, relatedEvents } from "./query";
import { redactEvent, type RedactionContext } from "./redaction";
import { buildSeedAuditEvents } from "./seed";
import type { AuditEvent, AuditFilters, AuditStats } from "./types";

export interface AuditRepository {
  list(filters: AuditFilters, ctx: RedactionContext): Promise<AuditEvent[]>;
  get(id: string, ctx: RedactionContext): Promise<AuditEvent | null>;
  related(id: string, ctx: RedactionContext): Promise<AuditEvent[]>;
  stats(filters: AuditFilters, ctx: RedactionContext): Promise<AuditStats>;
  /** Write path for real emitters. Returns the stored (redacted) event. */
  record(event: Omit<AuditEvent, "id">): Promise<AuditEvent>;
}

export class InMemoryAuditRepository implements AuditRepository {
  private events: AuditEvent[];

  constructor(events: AuditEvent[] = buildSeedAuditEvents()) {
    this.events = [...events];
  }

  async list(filters: AuditFilters, ctx: RedactionContext) {
    return filterEvents(this.events, filters).map((e) => redactEvent(e, ctx));
  }

  async get(id: string, ctx: RedactionContext) {
    const found = this.events.find((e) => e.id === id);
    return found ? redactEvent(found, ctx) : null;
  }

  async related(id: string, ctx: RedactionContext) {
    const found = this.events.find((e) => e.id === id);
    if (!found) return [];
    return relatedEvents(this.events, found).map((e) => redactEvent(e, ctx));
  }

  async stats(filters: AuditFilters, ctx: RedactionContext) {
    return computeStats(await this.list(filters, ctx));
  }

  async record(event: Omit<AuditEvent, "id">) {
    const stored: AuditEvent = {
      ...event,
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      seeded: event.seeded ?? false,
    };
    this.events = [stored, ...this.events];
    return redactEvent(stored, { canSeeSensitiveMetadata: false });
  }

  /** Test/demo helper: raw, unredacted rows. Never call from UI code. */
  allRaw() {
    return [...this.events];
  }
}

/** Process-wide default repository used by the Audit Viewer UI. */
export const auditRepository: AuditRepository = new InMemoryAuditRepository();
