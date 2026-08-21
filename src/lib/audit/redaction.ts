/**
 * Redaction policy for the audit stream.
 *
 * Secrets, tokens and credentials are NEVER displayed — not even to Admins.
 * Redaction happens inside the repository layer, so the UI can never receive a
 * raw secret regardless of what an emitter wrote into the event.
 */
import type { AuditEvent, AuditFieldChange } from "./types";

export const REDACTED = "•••• redacted ••••";

const SENSITIVE_PATTERNS = [
  /secret/i,
  /token/i,
  /password/i,
  /passphrase/i,
  /credential/i,
  /api[_\-\s]?key/i,
  /private[_\-\s]?key/i,
  /authorization/i,
  /bearer/i,
  /client[_\-\s]?id/i,
  /signature/i,
  /cookie/i,
  /session[_\-\s]?id/i,
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

function redactValue(key: string, value: string | null): string | null {
  if (value === null || value === "") return value;
  return isSensitiveKey(key) ? REDACTED : value;
}

export function redactChanges(changes: AuditFieldChange[]): AuditFieldChange[] {
  return changes.map((change) => ({
    field: change.field,
    oldValue: redactValue(change.field, change.oldValue),
    newValue: redactValue(change.field, change.newValue),
  }));
}

export function redactMetadata(
  metadata: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return metadata;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    out[key] = isSensitiveKey(key) ? REDACTED : value;
  }
  return out;
}

/** Masks the last octet of an IPv4 address for non-admin viewers. */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const parts = ip.split(".");
  if (parts.length !== 4) return ip.replace(/[0-9a-f]{1,4}$/i, "••••");
  return `${parts[0]}.${parts[1]}.${parts[2]}.•••`;
}

export interface RedactionContext {
  /** Admins see full source metadata; everyone else gets masked network detail. */
  canSeeSensitiveMetadata: boolean;
}

/** Single entry point: every event leaving the repository passes through here. */
export function redactEvent(event: AuditEvent, ctx: RedactionContext): AuditEvent {
  return {
    ...event,
    changes: redactChanges(event.changes),
    metadata: redactMetadata(event.metadata),
    source: {
      ...event.source,
      ip: ctx.canSeeSensitiveMetadata ? event.source.ip ?? null : maskIp(event.source.ip),
      device: ctx.canSeeSensitiveMetadata ? event.source.device ?? null : event.source.device ?? null,
    },
  };
}
