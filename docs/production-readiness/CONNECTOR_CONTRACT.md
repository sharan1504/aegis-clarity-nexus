# Provider Connector Contract

A provider is not considered operationally connected because OAuth or credential validation succeeded.

## Connected-state evidence

The runtime connection state is derived from three independent facts:

1. Provider credentials are present server-side.
2. A real provider call has produced healthy evidence.
3. A real sync has completed successfully and persisted evidence.

Missing or failed evidence is surfaced as action required / failed; it is never converted to an empty success state.

## Current contract-backed providers

- Genesys Cloud: existing dedicated connector path.
- GitHub: GitHub App installation, health check, paginated repository/workflow/security sync, and stale-entity reconciliation.
- Jira: OAuth, live project/issue sync, sync evidence, and stale-entity reconciliation. Governed writes are not enabled.
- Slack: OAuth, live workspace/channel sync, sync evidence, and stale-entity reconciliation.
- Salesforce: OAuth, live organization sync, sync evidence, and stale-entity reconciliation.
- ServiceNow: OAuth, live user sync, sync evidence, and stale-entity reconciliation.

Other registry entries remain catalog entries but are explicitly rejected by the production connector entry point with `provider_not_implemented` until their contract implementation is complete.

## Sync semantics

Provider sync is idempotent at the provider/tenant/connection/entity key level. The current provider snapshot is compared with persisted active entities; entities absent from the latest snapshot are marked `stale` rather than silently retained as current evidence.

## Write semantics

The contract exposes the future `executeApprovedAction` surface, but this batch does not claim governed write execution or post-change verification for Jira, Slack, Salesforce, or ServiceNow. Those capabilities must remain unsupported until the approval -> execution -> provider verification -> post-change sync -> audit path is implemented.
