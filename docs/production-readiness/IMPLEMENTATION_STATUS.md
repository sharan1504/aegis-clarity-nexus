# Production implementation status

This document is the implementation truth for the current Aegis/CenOps production boundary. It intentionally distinguishes **read/sync contract coverage**, **catalog-only providers**, and **governed write/verification**. A provider is not considered Connected merely because credentials or OAuth succeeded.

## A) Contract-backed read/sync providers

The current generic provider connector contract is implemented for:

| Provider | Auth / connection | Health | Read / sync | Stale reconciliation | Evidence-derived Connected | Governed writes |
|---|---|---:|---:|---:|---:|---:|
| Genesys Cloud | Existing dedicated OAuth path | Yes | Yes | Yes, on successful sync | Yes | Existing dedicated mutation path; not part of the generic contract claim |
| GitHub | GitHub App installation | Yes | Repositories, workflow runs, code scanning / Dependabot | Yes | Yes | **Not yet implemented through the generic approved-action contract** |
| Jira | OAuth | Yes | Project / issue sync | Yes | Yes | Unsupported |
| Slack | OAuth | Yes | Workspace / channel sync | Yes | Yes | Unsupported |
| Salesforce | OAuth | Yes | Organization sync | Yes | Yes | Unsupported |
| ServiceNow | OAuth | Yes | User sync | Yes | Yes | Unsupported |

`CONTRACT_IMPLEMENTED_PROVIDERS` is the runtime allow-list for this generic contract. The connected state is derived from stored credentials plus successful provider health evidence plus successful sync evidence; missing or failed evidence must remain pending/failed rather than becoming Connected. See `src/lib/integrations/provider-contract.ts` and `docs/production-readiness/CONNECTOR_CONTRACT.md`.

GitHub is backed by a real GitHub App installation flow. The server verifies the signed tenant/user-bound installation state, verifies the installation with GitHub, stores only encrypted installation identity, and mints short-lived installation tokens on demand. Its sync persists repositories, workflow runs and supported security alerts and marks entities absent from the latest snapshot as `stale`. Manual Sync Now is provider-backed and does not require the durable worker.

## B) Catalog-only / `provider_not_implemented`

Providers may still appear in the catalog/registry for product discoverability, but registry presence is **not** proof of an operational connector.

Any provider outside `CONTRACT_IMPLEMENTED_PROVIDERS` must remain rejected by the production connection entry point with `provider_not_implemented`. In particular, these catalog entries are not production read/sync implementations merely because they declare auth modes or capabilities in `src/lib/integrations/provider-registry.ts` / `src/lib/connectors/registry.ts`:

- AWS
- Azure
- Microsoft 365 / Entra ID
- GCP
- Google Workspace
- Freshworks
- Zendesk
- and the remaining catalog entries that are not in the contract allow-list

Some provider-specific code exists in the repository (for example the Microsoft 365 Graph connector), but a provider is not promoted into the generic production contract until the complete connection, secure storage, health, sync, stale reconciliation, and evidence-derived Connected path is wired and verified end-to-end.

## C) Write + verification status

The production boundary is currently **read/sync-first**.

The generic connector interface exposes an `executeApprovedAction` surface, but the default contract implementation explicitly returns `provider_action_unsupported`. Jira, Slack, Salesforce and ServiceNow therefore remain read/sync-only from the generic connector contract and must not expose external mutations from recommendation cards or direct UI actions.

The existing Change Control / Approval Center path persists change records, approval decisions and immutable audit entries, and the unified execution gateway fail-closes writes unless workspace policy permits them and an approved change context is present. That approval path is **not the same thing as a provider mutation + verification path**. The current GitHub connector has real read/health/sync capability but no verified governed issue/PR mutation path in the contract yet.

Target write lifecycle for a provider mutation is:

```text
Proposed
  -> Approved
  -> Executing
  -> Verified | Failed | Verification Unsupported
```

A complete production write must prove all of the following:

1. A persisted change record exists and carries the intended provider action.
2. Required approvals are present and authorized server-side.
3. `executeApprovedAction` is reached only through the server governance gate.
4. The external provider mutation returns evidence that the intended write was accepted.
5. Verification re-reads provider state or otherwise obtains authoritative provider evidence. `verification_unsupported` is acceptable only when the provider genuinely cannot verify the mutation.
6. A post-change provider sync reconciles the new state into Aegis.
7. An immutable audit event records the execution and verification result.
8. The UI shows the actual stage and does not infer Verified from approval or execution alone.

Until that path exists for a provider, the product must represent the write as unsupported rather than simulate success.

## Job worker production truth

The pg-boss worker is **not verified as deployed in production** and is intentionally treated as disabled until a persistent worker host/process manager is provisioned.

The repository has the worker source and Edge Function enqueue path, but no Docker/ECS/Kubernetes/VM/process-manager deployment configuration is present. The scheduled provider sync Edge Function fails closed when `JOB_QUEUE_URL` or `AEGIS_JOB_QUEUE_SECRET` is missing. Production must not configure those variables until a real worker endpoint is deployed and health-checked.

This does **not** block manual provider synchronization for contract-backed connectors. Manual Sync Now invokes provider-backed server functions directly and should remain usable without the durable worker.

## Promotion rule

A provider moves from catalog-only to contract-backed only when the repository contains and verifies the complete production path:

```text
auth -> secure server-side credential storage -> health -> real sync -> stale/deletion reconciliation -> persisted evidence -> evidence-derived Connected
```

A provider moves from read/sync to write-capable only when the complete governed mutation lifecycle is real and auditable:

```text
approved change -> server-authorized execution -> provider mutation -> provider verification -> post-change sync -> immutable audit
```
