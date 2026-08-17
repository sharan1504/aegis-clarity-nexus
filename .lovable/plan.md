# Governance correction: Guardrails, Instructions, and one enforcement gate

Three corrections only. No platform redesign; existing visual language, Agent pages, Connector architecture, Capability Router, Policy Engine, Change Control Center, MCP surface, and audit chain stay as they are.

## 1. Fix the save error (and the empty Platform baseline)

What the database actually shows right now:

- `public.guardrails` holds 9 rows, all `is_system = true` — so the baseline records exist, yet the UI shows "Platform baseline (0)".
- Table grants for `authenticated` on `guardrails` / `guardrail_revisions` are present and correct.
- The `guardrails_select` policy and the `guardrail_revisions_select` policy both call `public.current_tenant_id()`, and `authenticated` has **no EXECUTE privilege** on that function (it was revoked during an earlier security fix). `app_private.has_role` and `app_private.is_tenant_member` are still executable.

That missing EXECUTE explains both symptoms: any statement whose rows reach the second (`tenant_id IS NULL`) branch of the policy fails with a function permission error, so the baseline never lists, and the insert's `RETURNING`-backed read fails, which the service reports as the generic "could not be saved" message.

Work:

1. Reproduce first, as the `authenticated` role, against both the list and the insert path, and confirm the failure text before changing anything. If the reproduction shows a different cause, fix that cause instead of assuming this one.
2. Migration: rewrite both SELECT policies to use only `app_private`-scoped, authenticated-executable helper functions (no dependency on a function `authenticated` cannot call), keeping the current security intent: tenant rows visible to tenant members; null-tenant rows visible only when `is_system = true`. Grant `guardrail_revisions` the INSERT path the revision trigger needs, verified explicitly rather than assumed.
3. Error surfacing: `guardrailErrorPayload` already carries `errorCode` and per-field issues. Add distinct codes for permission errors, invalid enum values, and unexpected database errors, and map the raw Postgres error (code + constraint) to a specific message such as "Guardrail could not be saved: administrator permission required." Log the full error server-side with tenant, actor, guardrail id, and Postgres code; never log secrets.
4. Editor: surface field-level issues inline next to Name / Scope / Type / Conditions / Action / Severity / Enforcement mode instead of one banner.

Acceptance (end-to-end, run in the browser as an admin): create an organization guardrail, confirm it persists, appears immediately, survives refresh, edits, toggles enabled/disabled, appears in the simulator verdict, is evaluated by the engine, and produces audit entries.

## 2. Platform baseline made explicit and immutable

The 9 existing system rows are reviewed and reconciled against the six required baseline controls (No Credential Exposure, Tenant Isolation, Fail-Closed Governance, Production Destructive Action Protection, Approval Integrity, Guardrail Enforcement Integrity) — missing ones added by migration, duplicates or gaps corrected. All are `is_system = true`, `tenant_id IS NULL`.

Server-side protection (not UI hiding): system rows remain non-updatable, non-deletable, non-disableable by tenant admins at both the RLS layer and the service layer, and a tenant guardrail whose effect is weaker than a matched platform guardrail cannot change the outcome — the evaluator's most-restrictive-wins ordering is already correct, and gets explicit test coverage.

## 3. Instructions & Guidelines (new capability)

New `organization_instructions` table following existing tenant/RLS/versioning patterns (revisions table + trigger, same shape as guardrail revisions): tenant_id, name, description, instruction_text, category, scope (organization | agent | integration | capability), scope_id, priority, enabled, version, created_by/updated_by, timestamps. Grants + RLS: tenant members read, admins write.

Server functions in a new `src/lib/instructions.functions.ts` with logic in `src/lib/instructions/*.server.ts`, mirroring the guardrails service (role re-check, tenant forced from session, validation, audit).

Composition: a deterministic resolver assembles applicable instructions in fixed order Organization → Agent → Integration → Capability, priority within scope, disabled rows excluded, conflicts surfaced rather than silently dropped. It feeds the existing agent instruction assembly (`agent_settings` pre/system/post) — instructions are prompt guidance only and are never consulted by the guardrail engine, RBAC, or tenant isolation.

UI: an "Instructions & Guidelines" section in Governance in the current visual style — list with scope/category/status/version, filters, an add/edit sheet with a plain-language text field (type the sentence, optionally get a suggested structured scope/category), and the required helper text: "Instructions guide agent behavior. They do not replace Guardrails, Policies, permissions, or approval controls."

## 4. One enforcement gate, no bypass

- **MCP**: `src/lib/mcp/guarded.ts` currently only sanitizes output. It will call the existing `runGuardedTool` (auth → tenant → capability → policy → guardrail → approval → execute → sanitize) so every MCP tool runs the same engine. No MCP-specific guardrail logic.
- **Action gateway**: one server-side entry point (`src/lib/execution/gateway.server.ts`) that every future mutation must pass through — MCP, workflows, background jobs, APIs, agents. Connectors get no exported mutation path of their own; connector functions become gateway-internal.
- **Limits**: add an explicit `allow_with_limit` decision. The gateway truncates or refuses the operation server-side before the connector is called; callers are never trusted with `maxRecords`.
- **Fail-closed**: any evaluation error blocks every write/destructive/production/credential/permission path. Reads keep their defined degraded behavior.
- **Explainability**: blocked results carry guardrail name, severity, version, and the required next step, without leaking internal security detail.

## 5. Governance navigation

Existing Governance page keeps its style and gains logical sections: Guardrails (Platform Baseline / Organization Guardrails), Policies (existing engine, read-only view), Instructions & Guidelines, Simulator, Activity. Empty states corrected — baseline lists its seeded controls; organization guardrails and instructions show a real "none configured yet" + create action.

## 6. Simulator

Same inputs, extended output: matched Guardrails ("enforced control"), matched Policies ("business logic"), and applicable Instructions ("guidance") shown as visually distinct groups, plus the decision (allow / allow_with_limit / require_confirmation / require_approval / escalate / block).

## 7. Audit and tests

Audit entries for guardrail created/updated/enabled/disabled/deleted/evaluated/blocked/approval-required and instruction created/updated/enabled/disabled, plus policy evaluated — tenant, actor, timestamp, object, version, action, decision. No tokens or secrets, ever.

Vitest coverage extends the existing guardrail suite with the 13 guardrail security cases (system immutability, platform-over-organization precedence, fail-closed, MCP/workflow/job/connector bypass attempts, maxRecords, sanitization, tenant isolation) and the 9 instruction cases (each scope creatable, no guardrail/RBAC bypass, versioned, audited, disabled instructions not applied).

## Out of scope

No Genesys mutation APIs. No autonomous execution. Governance foundation only.

## Technical notes

- Root-cause fix is a migration plus policy rewrite; no change to `src/integrations/supabase/*` generated files.
- `guardrails.functions.ts` / new `instructions.functions.ts` stay thin wrappers; all logic in `*.server.ts` loaded inside handlers.
- Supabase types get regenerated for the new table.
