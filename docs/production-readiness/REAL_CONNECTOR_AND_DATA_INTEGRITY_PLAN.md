# Aegis Production Connector & Data Integrity Readiness

This document is the implementation contract for moving Aegis from MVP/mock integration behavior to production-ready connectors and real provider-backed recommendations.

## Non-negotiable rules

- A connected provider must never display seeded/mock business data.
- Configure must perform real provider authentication/credential validation.
- Provider credentials and refresh/access tokens are server-side secrets only.
- Every provider read/write is tenant-scoped and authorization-checked server-side.
- Approved mutations require a persisted approved change record and are executed server-side.
- Provider API failures are visible; never silently convert failures into empty/mock success.
- Sync is idempotent and reconciles deletions, not just upserts.
- Dashboard/report/chat counts must come from the same persisted provider snapshot and expose freshness.

## Connector contract

Every connector must implement:

```text
connect / authorize
validateConnection
refreshCredentials
disconnect
healthCheck
sync(entityScope)
getSyncStatus
getCapabilities
executeApprovedAction(action, approvalContext)
```

The connector registry currently targets:

- Genesys Cloud
- AWS
- Azure
- Microsoft 365 / Entra ID
- Jira
- ServiceNow
- Salesforce
- Slack
- GitHub

Provider-specific auth, scopes and API endpoints must be taken from current official documentation. If a provider cannot support a requested capability with the selected auth mode, the capability must be reported unsupported rather than mocked.

## Genesys Cloud data integrity contract

The License Agent must use a complete tenant snapshot. A sync must:

1. Authenticate using the customer's tenant connection.
2. Fetch every page of the relevant user/license/assignment endpoints.
3. Upsert by stable provider IDs.
4. Reconcile records missing from the latest successful full snapshot.
5. Update `last_synced_at`, sync status, provider record counts and persisted record counts.
6. Commit a successful snapshot atomically.
7. Never report a successful sync if any required page failed.

`Sync Now` must invoke the provider sync, not merely reload an old cache.

## Recommendation pipeline

```text
provider connection
  -> complete synchronized snapshot
  -> deterministic license metrics
  -> evidence-backed recommendation
  -> persisted change record
  -> human approval
  -> authorized provider mutation
  -> provider verification
  -> post-change sync
  -> audit event
```

Simple factual questions should be answered from structured data without an LLM. LLM reasoning is used only where interpretation/recommendation is required, and it receives only authorized evidence.

## Security contract

Review every RLS policy and server function for:

- cross-tenant reads/writes
- workspace membership manipulation
- self-role escalation
- IDOR
- client-controlled tenant IDs
- unauthorized connector access
- unauthorized provider mutations
- exposed provider secrets
- unsafe audit/revision writes

Revision histories remain append-only and client writes are denied. Controlled database triggers may write history.

## Definition of done

A connector is production-ready only when:

- real auth is wired
- credentials are securely stored
- connection health is real
- initial sync is real
- scheduled/manual sync is real
- data is persisted
- stale/deleted provider records reconcile
- errors are surfaced
- tenant isolation is tested
- audit events are recorded
- any supported mutations require approval and are verified after execution
- build/typecheck/tests pass

UI-only configuration, static demo counts, seeded provider records, or fake Connected states do not satisfy this definition.
