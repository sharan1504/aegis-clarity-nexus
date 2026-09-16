# Production implementation status

This document is the current implementation ledger. It intentionally distinguishes **contract-backed read/sync** from catalog presence and from governed write/verification capability.

## A. Contract-backed read/sync providers

The provider connector contract requires credentials stored server-side, a real provider health check, and a successful real sync before a connection can be represented as `connected`. Missing or failed evidence must remain visible as pending/failed/action-required; it must not be converted into success.

Current contract-backed read/sync providers:

| Provider | Read / health | Sync | Stale/deletion reconciliation | Governed write + verification |
| --- | --- | --- | --- | --- |
| Genesys Cloud | Implemented | Implemented | Implemented in existing connector path | Unsupported |
| GitHub | Implemented via GitHub App installation | Implemented: repositories, workflow runs, security | Implemented | **Implemented for create-issue only** |
| Jira | Implemented | Implemented: projects/issues | Implemented | Unsupported |
| Slack | Implemented | Implemented: workspace/channels | Implemented | Unsupported |
| Salesforce | Implemented | Implemented: organization data | Implemented | Unsupported |
| ServiceNow | Implemented | Implemented: users | Implemented | Unsupported |

The authoritative provider list is `CONTRACT_IMPLEMENTED_PROVIDERS` in `src/lib/integrations/provider-contract.ts`. It currently contains exactly: `genesys`, `github`, `jira`, `slack`, `salesforce`, `servicenow`.

## B. Catalog-only / `provider_not_implemented`

The provider registry contains a broader product catalog. Registry presence, `available` status, OAuth metadata, or declared capabilities **does not mean the provider has a production connector**.

Any provider outside `CONTRACT_IMPLEMENTED_PROVIDERS` must remain explicitly `provider_not_implemented` at production connect/sync entry points until its complete contract implementation exists.

This currently includes catalog entries such as AWS, Azure, Microsoft 365, GCP, Google Workspace, HubSpot, Freshworks, Zendesk, Zoho, GitLab, Confluence, Rubrik, Veeam, Cohesity, CrowdStrike, Microsoft Defender, Okta, Datadog, New Relic, Splunk, PagerDuty, Workday, SAP, Oracle, Snowflake, and MongoDB. Some have partial capability/router code or provider-specific authentication research; that partial code is **not** promoted to contract-backed production connect/sync status by this document.

## C. Write + verification status

The governed execution boundary enforces authenticated tenant identity, server-side guardrails, and approval requirements for writes. The execution handoff requires a persisted change record whose approval state is `Ready to Execute`.

GitHub now has one narrow, real governed write path: create a GitHub issue through the connected GitHub App installation, verify the created issue with a provider read-back, run the normal GitHub post-change sync/reconciliation, and append immutable audit evidence.

The lifecycle is:

`Proposed → Approved/Ready to Execute → Executing → Verified | Failed`

`Verification Unsupported` remains an explicit terminal state for future provider actions where verification is genuinely impossible; it is not used for the GitHub create-issue path because GitHub supports direct verification.

For a provider write to be promoted, all of these must be real and server-authorized:

1. Persisted change record with the approved provider action bound to it.
2. Required approval(s) completed.
3. Server-authorized `executeApprovedAction` invocation.
4. Real provider mutation.
5. Provider verification evidence.
6. Post-change provider sync/reconciliation.
7. Immutable audit event containing the execution and verification outcome.

Recommendations are not approvals, and approval is not execution or verification. No recommendation card may directly perform an external write.

### Current write status

- Genesys: read/sync contract-backed; governed mutation + verification not claimed here.
- GitHub: **create issue is governed, provider-verified, post-sync verified, and audited. Other GitHub writes remain unsupported.**
- Jira: governed writes unsupported.
- Slack: governed writes unsupported.
- Salesforce: governed writes unsupported.
- ServiceNow: governed writes unsupported.
- All catalog-only providers: production writes unsupported.

## Job worker production truth

The pg-boss worker is **not verified as production-deployed**. The repository has worker source but no Docker/ECS/Kubernetes/VM/process-manager deployment configuration, so scheduled durable sync must not be described as live. The queue entry points fail closed when the queue URL or secret is missing.

Manual `Sync Now` remains the supported operational path for contract-backed providers without depending on the worker. When a real persistent worker deployment exists, it must be separately health-checked and documented before queue environment variables are enabled in production.

## Evidence integrity rules

- Never fake `Connected`.
- Never invent tenant/provider evidence.
- Recommendations ≠ Approvals ≠ Verified outcomes.
- Writes only through approved change records and server-side authorization.
- Unsupported provider capabilities remain explicitly unsupported.
- Demo fixtures are only valid in explicit demo mode and must never be presented as live tenant evidence.
