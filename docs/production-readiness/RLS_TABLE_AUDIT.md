# RLS Table-by-Table Audit

Audit date: 2026-08-22

Scope: all `public` tables present in the Supabase schema/migrations on `main`, verified against the live Supabase catalog. The production contract requires tenant isolation and explicit authorization for provider reads/writes; server-only credential/state tables intentionally have no `authenticated` policies because they are not Data API writable/readable. The live catalog currently reports RLS enabled on every public table.

## Summary

- Every public table in the live catalog has RLS enabled.
- Tenant-scoped application data has tenant membership policies appropriate to its access pattern.
- Server-only credential/OAuth tables intentionally expose **0 authenticated policies** and revoke authenticated writes; access is through trusted server-side paths.
- Append-only revision/audit tables intentionally omit client write policies and rely on SECURITY DEFINER trigger paths where applicable.
- The audit found no tenant-scoped public table with RLS disabled.

## Live catalog audit

| Table | RLS | Policies | Access assessment |
|---|---:|---:|---|
| `agent_capabilities` | ON | 1 | Global catalogue; authenticated SELECT only. |
| `agent_definitions` | ON | 1 | Global catalogue; authenticated SELECT only. |
| `agent_integration_bindings` | ON | 4 | Tenant-scoped; member SELECT, admin/manager writes with tenant/integration/capability checks. |
| `agent_policy_revisions` | ON | 1 | Tenant-scoped append-only history; authenticated SELECT only; trigger records revisions. |
| `agent_settings` | ON | 3 | Tenant-scoped; member SELECT, admin/manager INSERT/UPDATE. |
| `audit_log` | ON | 2 | Tenant-scoped; authenticated SELECT/INSERT; update/delete blocked by immutable trigger. |
| `capabilities` | ON | 1 | Global capability catalogue; authenticated SELECT only. |
| `change_approvals` | ON | 4 | Tenant-scoped; member SELECT/INSERT/UPDATE, admin DELETE. |
| `change_records` | ON | 4 | Tenant-scoped; member SELECT/INSERT/UPDATE, admin DELETE. |
| `genesys_licenses` | ON | 1 | Tenant-scoped provider snapshot; authenticated SELECT only; server sync writes. |
| `genesys_queues` | ON | 1 | Tenant-scoped provider snapshot; authenticated SELECT only; server sync writes. |
| `genesys_user_licenses` | ON | 1 | Tenant-scoped provider snapshot; authenticated SELECT only; server sync writes. |
| `genesys_users` | ON | 1 | Tenant-scoped provider snapshot; authenticated SELECT only; server sync writes. |
| `guardrail_evaluations` | ON | 2 | Tenant-scoped; SELECT plus constrained append path. |
| `guardrail_revisions` | ON | 1 | Tenant/platform history; authenticated SELECT only; INSERT/UPDATE/DELETE rejected by immutability trigger. |
| `guardrails` | ON | 4 | Tenant-scoped governance; admin writes; platform rows read-only to callers. |
| `integration_credentials` | ON | 0 | **Server-only secret store.** No authenticated grants/policies; service role only. |
| `integration_oauth_states` | ON | 0 | **Server-only OAuth state.** No authenticated grants/policies; service role only. |
| `integration_sync_runs` | ON | 1 | Tenant-scoped sync history; authenticated SELECT only. |
| `integrations` | ON | 1 | Tenant-scoped metadata; authenticated SELECT only; server-side mutation path. |
| `notifications` | ON | 4 | Tenant/user scoped; member CRUD with recipient restriction on SELECT. |
| `organization_instruction_revisions` | ON | 1 | Tenant-scoped append-only history; authenticated SELECT only; trigger records revisions. |
| `organization_instructions` | ON | 4 | Tenant-scoped; member SELECT, admin CRUD. |
| `profiles` | ON | 4 | User/tenant scoped; self/member SELECT; self-only profile INSERT/UPDATE after security lockdown. |
| `provider_capabilities` | ON | 1 | Global provider capability catalogue; authenticated SELECT only. |
| `reports` | ON | 3 | Tenant-scoped; member SELECT/INSERT/DELETE. |
| `tenants` | ON | 3 | Tenant membership SELECT; tenant creation bootstrap; admin update. |
| `user_roles` | ON | 4 | Tenant-scoped; member SELECT; bootstrap/admin role management constrained by security lockdown. |

## Migration-history observations

Some older migrations do not repeat `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` beside every later policy change. That is a migration-history readability problem, not evidence that RLS is disabled. The live catalog check above is authoritative for the current schema state.

The security lockdown migrations explicitly tightened the previously exploitable membership boundary: self role updates/deletes are blocked, cross-tenant profile mutation is constrained, and role insertion/update paths are tenant/actor checked. The new regression suite is at `supabase/tests/security_boundary.sql`.

## Immediate remediation status

No new `ENABLE ROW LEVEL SECURITY` migration is required because the live catalog shows RLS enabled on every public table. The remaining work is to keep this audit current whenever new tables are introduced and to ensure each new tenant-scoped table is created with RLS enabled and explicit policies in the same migration.

## Contract alignment

This audit is aligned with the production connector/data-integrity contract: tenant isolation, server-side authorization, secure credential storage, and append-only revision/audit guarantees must hold independently of UI behavior. Server-only tables are deliberately inaccessible through authenticated Data API grants rather than being made writable merely to obtain policy coverage.
