# Production implementation status

## Completed in this pass

- Removed the fake non-Genesys integration wizard and its `setTimeout` success simulation.
- Added a provider registry with explicit auth/scopes/capabilities.
- Added a server-side provider connection entry point.
- Non-implemented providers now return an explicit `provider_not_implemented` error instead of displaying Connected.
- Genesys remains on the real OAuth flow.
- Genesys manual sync remains provider-backed and reconciliation runs only after a successful sync.

## Still required before calling the entire product production-ready

The following providers need their complete server-side implementation, not just registration:

- AWS: credential/OAuth flow, secure storage, health check, real sync, deletion reconciliation.
- Azure: credential/OAuth flow, secure storage, health check, real sync, deletion reconciliation.
- Microsoft 365: OAuth/app credential flow, secure storage, Graph health check, license/user sync, deletion reconciliation.
- Jira: OAuth flow, secure storage, health check, issue/project sync.
- ServiceNow: OAuth flow, secure storage, health check, incident/change/CMDB sync.
- Salesforce: OAuth flow, secure storage, health check, object sync.
- Slack: OAuth flow, secure storage, health check, workspace/channel sync.
- GitHub: OAuth/app flow, secure storage, health check, repository/security sync.

For every provider, Connected must mean:

1. Authentication succeeded.
2. Credentials are persisted server-side.
3. A real health check succeeded.
4. An initial real sync succeeded where applicable.
5. Counts/freshness are persisted from provider data.
6. Failures are surfaced without falling back to mock data.

## Execution automation still required

Recommendations must follow:

provider snapshot -> deterministic evidence -> recommendation -> persisted change record -> approval -> authorized provider mutation -> provider verification -> post-change sync -> immutable audit event.

No destructive or external write operation should be reachable directly from a recommendation card without an approval check and server-side authorization.
