import crypto from "node:crypto";

export function buildIdempotencyKey(namespace: string, parts: Record<string, string | number | boolean | null | undefined>): string {
  const normalized = Object.entries(parts)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  const payload = JSON.stringify([namespace, normalized]);
  return `${namespace}:${crypto.createHash("sha256").update(payload).digest("hex")}`;
}
