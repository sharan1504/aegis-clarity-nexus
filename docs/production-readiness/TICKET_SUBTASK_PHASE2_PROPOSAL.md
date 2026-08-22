# Ticket Subtask Fan-Out — Phase 2 Proposal

## Why Phase 1 stops here

The requested Phase 1 fan-out must remain migration-free and must source routing targets from data already synced/stored by the tenant. The current schema does not satisfy that requirement for both supported ticket systems.

### Existing configuration storage reviewed

- `public.guardrails` has JSONB `conditions` and `action` columns and could technically carry a small, manually-authored routing convention without a migration.
- `public.organization_instructions` does not currently have a JSONB configuration column; it is instruction text and should not be overloaded with routing data.
- Using `guardrails.action` for routing would also mix operational routing configuration with security enforcement semantics. That is acceptable only as a short-lived compatibility mechanism, not as the production design.

### Existing provider evidence reviewed

- Jira synchronization already stores real project entities in `public.provider_sync_entities`, including project key/name data. A Jira routing target can therefore be validated against synchronized provider evidence.
- There is currently no equivalent ServiceNow synchronization of assignment groups in `public.provider_sync_entities`. The existing ServiceNow connector path is not production-complete, so a ServiceNow assignment group cannot currently be validated as an already-synced/stored tenant value.

Because the feature is required to support both Jira and ServiceNow and must not invent routing targets, implementing Phase 1 now would either violate the real-data requirement or introduce a second, ad-hoc source of truth. This proposal deliberately stops before adding fan-out logic or a migration.

## Recommended Phase 2 architecture

Create a tenant-scoped `ticket_routing_rules` table rather than continuing to overload guardrail JSONB.

Suggested shape:

```text
id                    uuid primary key
tenant_id             uuid not null
provider              text not null          -- jira | servicenow
category              text nullable
severity              text nullable
guardrail_key         text nullable
team_key              text not null
display_name           text not null
target_key             text not null          -- Jira project key / ServiceNow assignment group
priority               integer not null default 100
enabled                boolean not null default true
created_by             uuid
updated_by             uuid
created_at             timestamptz
updated_at             timestamptz
```

Use deterministic precedence such as:

1. Exact guardrail + category + severity
2. Category + severity
3. Category
4. Severity
5. Provider default

Do not silently fall back to an invented project or assignment group. If a configured target is no longer present in synchronized provider data, fail the routing operation explicitly.

## Provider validation requirements

### Jira

Validate each configured `target_key` against a current, non-stale synchronized Jira `project` entity before creating a subtask. The project key should come from provider synchronization, not from a hard-coded catalog.

The Jira parent remains the existing Task. Each child should be created as a Jira subtask with:

```json
{
  "fields": {
    "project": { "key": "<synced-project-key>" },
    "parent": { "key": "<parent-key>" },
    "summary": "[Aegis] <team> — <change title>",
    "issuetype": { "name": "Subtask" }
  }
}
```

The implementation should discover/validate the actual subtask issue type supported by the target Jira project rather than assuming every Jira project uses the literal name `Subtask`.

### ServiceNow

Complete the real ServiceNow synchronization required to persist assignment groups as tenant-scoped provider evidence. Only then should a routing rule be allowed to reference an assignment group.

After validation, create `change_task` records with `change_request` pointing to the parent change request sys_id and the configured assignment group.

## Audit and change-record behavior

Every child ticket must be represented in the existing `change_records.external_tickets` array and timeline. The parent ticket remains the first external ticket and the child records identify:

- parent ticket
- provider
- routed team
- target project/assignment group
- child ticket ID/key
- creation timestamp

Partial failure must be explicit. If child N fails after children 1..N-1 were created, the server must return an error that identifies the failed child and must not report the operation as fully successful. Existing successful child records should remain auditable rather than being hidden or replaced with a mock success.

## UI follow-up

Phase 2 should add an admin-only routing editor with:

- provider selector
- category/severity/guardrail conditions
- synced team/target selectors
- rule priority
- enable/disable
- validation against current provider sync freshness
- audit history
- preview of which teams a change would fan out to

No UI is part of the current Phase 1/this proposal change.

## Migration boundary

No migration is included in this proposal. A future implementation should introduce the routing table only after review of the provider-sync requirements and the desired rule precedence. The migration should include tenant-scoped RLS and append-only/audited rule changes as appropriate for the final security model.
