// Output sanitization — the last guardrail in the chain.
//
// No agent output, capability result, tool response or log line may carry
// credentials. This runs on every value leaving the server boundary, so even a
// mis-scoped connector read or an LLM echoing its context cannot leak a token.

const SECRET_KEY_PATTERN =
  /(access_token|refresh_token|client_secret|clientsecret|id_token|authorization|api_key|apikey|secret|password|passwd|private_key|session_token|bearer|cookie|set-cookie|code_verifier|service_role)/i;

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
  /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}\b/g,
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
];

export const REDACTED = "[redacted]";

/** Masks secret-looking substrings inside free text. */
export function scrubText(input: string): string {
  let out = input;
  for (const pattern of SECRET_VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

/**
 * Deep-sanitizes any value: drops keys that look like credentials, masks secret
 * shapes in strings, and removes any additional fields a guardrail requires
 * redacted.
 */
export function sanitizeOutput<T>(value: T, extraRedactFields: string[] = []): T {
  const extra = new Set(extraRedactFields.map((f) => f.toLowerCase()));
  const seen = new WeakSet<object>();

  const walk = (input: unknown): unknown => {
    if (typeof input === "string") return scrubText(input);
    if (input === null || typeof input !== "object") return input;
    if (seen.has(input as object)) return undefined;
    seen.add(input as object);

    if (Array.isArray(input)) return input.map(walk);

    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(input as Record<string, unknown>)) {
      if (isSecretKey(key) || extra.has(key.toLowerCase())) {
        out[key] = REDACTED;
        continue;
      }
      out[key] = walk(child);
    }
    return out;
  };

  return walk(value) as T;
}
