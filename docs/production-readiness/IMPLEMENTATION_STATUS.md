# Production implementation status

This document is the implementation truth for the current Aegis/CenOps production boundary. It distinguishes **contract-backed read/sync**, **catalog-only providers**, and **governed write/verification**. A provider is not considered Connected merely because credentials or OAuth succeeded.

## A) Contract-backed read/sync providers

The generic provider connector contract requires a real provider health check and successful real synchronization before a connection can be represented as `connected`.

| Provider | Auth / connection | Health | Read / sync | Stale reconciliation | Evidence-derived Connected | Governed writes |
|---|---|---:|---:|---:|---:|---|
| Genesys Cloud | Existing dedicated OAuth path | Yes | Yes | Yes | Yes | Existing dedicated mutation path; not a generic-contract claim |
| GitHub | GitHub App installation | Yes | Repositories, workflow runs, supported security findings | Yes | Yes | Create issue only; governed + provider-verified |
| Jira | OAuth | Yes | Projects / issues | Yes | Yes | Unsupported |
| Slack | OAuth | Yes | Workspace / channels | Yes | Yes | Unsupported |
| Salesforce | OAuth | Yes | Organization data | Yes | Yes | Unsupported |
| ServiceNow | OAuth | Yes | Users | Yes | Yes | Unsupported |
| Microsoft 365 / Entra ID | Entra client credentials | Yes | Users, subscribed SKUs, license assignments | Yes | Yes | Unsupported |

`CONTRACT_IMPLEMENTED_PROVIDERS` is the authoritative runtime allow-list and currently contains exactly `genesys`, `github`, `jira`, `slack`, `salesforce`, `servicenow`, and `m365`.

Microsoft 365 uses the server-side Microsoft Graph connector with tenant ID, client ID and client secret stored encrypted in `provider_connections`. Sync reads users, subscribed SKUs and user-to-SKU assignments, persists them as provider entities, and marks entities absent from a successful snapshot as stale. Manual Sync Now invokes the same provider-backed server path and does not require the durable worker.

GitHub uses the GitHub App installation flow. The server stores encrypted installation identity and mints short-lived installation tokens on demand.

## B) Catalog-only / `provider_not_implemented`

The provider registry is a product catalog, not proof of implementation. Registry presence, OAuth metadata, `available` status, or declared capabilities do not make a provider production-ready.

Any provider outside `CONTRACT_IMPLEMENTED_PROVIDERS` must remain rejected by production connection/sync entry points with `provider_not_implemented` until the complete contract path exists.

This includes AWS, Azure, GCP, Google Workspace, HubSpot, Freshworks, Zendesk, Zoho, GitLab, Confluence, Rubrik, Veeam, Cohesity, CrowdStrike, Microsoft Defender, Okta, Datadog, New Relic, Splunk, PagerDuty, Workday, SAP, Oracle, Snowflake, MongoDB, and other catalog entries not in the allow-list.

Provider-specific code may exist for catalog-only entries. Partial code is not promoted to contract-backed production status until authentication, secure tenant credential storage, health, sync, stale/deletion reconciliation, and evidence-derived Connected are wired end-to-end through production entry points.

## C) Write + verification status

The production boundary is read/sync-first. The governed execution boundary requires authenticated tenant identity, server-side guardrails, and an approved persisted change context. Recommendations are not approvals, and approval is not execution or verification.

### GitHub governed write

GitHub has one narrow real governed mutation: **create issue**.

```text
Proposed -> Approved / Ready to Execute -> Executing -> Verified | Failed
```

The server-authorized path binds the provider action to the persisted change record, loads connected GitHub App credentials server-side, executes issue creation, reads the created issue back from GitHub as verification evidence, runs post-change GitHub sync/reconciliation, and records immutable audit evidence.

`Verification Unsupported` remains a valid terminal state for future provider actions where authoritative verification is genuinely impossible. It is not used for GitHub create-issue because GitHub supports provider read-back verification.

Other GitHub writes remain unsupported. Jira, Slack, Salesforce, ServiceNow and Microsoft 365 remain read/sync-only and must not expose external mutations from recommendation cards or direct UI actions.

### Write promotion rule

A provider write is promoted only when all of these are real and server-authorized:

1. Persisted change record carries the intended provider action.
2. Required approvals are present and authorized server-side.
3. `executeApprovedAction` is reached only through the governance gate.
4. The real provider mutation succeeds.
5. Authoritative provider verification evidence is captured.
6. Post-change provider sync/reconciliation completes.
7. An immutable audit event records execution and verification outcome.
8. The UI displays the actual execution stage rather than inferring Verified from approval or execution alone.

## Shared finding model

The shared evidence-backed finding contract is defined in `src/lib/evidence/finding.ts` and is intended as the common boundary for Command Center, Investigations and Analytics adapters. It requires `id`, `title`, `severity`, `category`, `impact`, `evidenceRefs`, `confidence`, `href`, and `freshness`.

Finding records must originate from real provider evidence or explicitly marked product/system evidence. No fabricated tenant findings are permitted. Recommendations and correlations must retain provenance and must not be presented as verified provider state.

## Job worker production truth

The pg-boss worker is **not verified as production-deployed**. The repository contains worker source and queue entry points, but no verified persistent worker deployment configuration. Scheduled durable sync must therefore not be described as live.

The scheduled queue entry path fails closed when `JOB_QUEUE_URL` or `AEGIS_JOB_QUEUE_SECRET` is missing. Production must not configure those variables until a real persistent worker endpoint is deployed and health-checked.

Manual `Sync Now` remains the supported operational path for contract-backed providers without depending on the worker.

## Evidence integrity rules

- Never fake `Connected`.
- Never invent tenant/provider evidence.
- Recommendations ≠ Approvals ≠ Verified outcomes.
- Writes only through approved change records and server-side authorization.
- Unsupported provider capabilities remain explicitly unsupported.
- Demo fixtures are valid only in explicit demo mode and must never be presented as live tenant evidence.
