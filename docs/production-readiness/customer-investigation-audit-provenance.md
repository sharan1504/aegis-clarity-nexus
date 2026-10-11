# Customer investigation audit provenance

## Current capture

Customer investigations record provider/MCP tool calls in the tenant-scoped `tool_invocations` table. The recorded arguments preserve the model-facing prompt and provider evidence supplied through the tool descriptor (up to the server-side 100,000-character storage boundary); the result is preserved in the invocation result field subject to the existing 12,000-character result safety boundary.

For each recorded tool action, CenOps now stores SHA-256 hashes for the full input arguments, full output value, prompt field when present, and evidence field when present. A corresponding append-only `audit_log` entry records the tool identity, investigation, invocation ID and those hashes. The audit log remains protected by the existing per-tenant hash chain and immutable-row triggers.

## What this means for review

- **Exact prompt/evidence source:** `tool_invocations.arguments` for the specific `toolInvocationId` referenced by the audit entry.
- **Exact tool output:** `tool_invocations.result` for the same invocation, with `output_hash` computed from the full pre-truncation result.
- **Integrity:** `audit_log.hash` and `prev_hash` provide the existing tenant-scoped hash chain; the action payload also carries the invocation input/output/prompt/evidence hashes.
- **Tool calls:** provider, server, tool name, arguments and result are recorded per invocation.
- **Tenant isolation:** investigation, invocation and audit records remain tenant-scoped and subject to their existing RLS/append-only controls.

## Limitation / position

EU AI Act Article 12 requires automatic recording of relevant events and traceability for applicable high-risk AI systems; it does not prescribe a specific field-by-field prompt schema. CenOps therefore treats the above as an engineering provenance position, not a legal certification. Retention, access controls, and whether a particular deployment falls within Article 12 should be assessed with the applicable compliance/legal context.
