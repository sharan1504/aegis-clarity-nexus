# Provider sync production status

## Phase 1 evidence contract

CenOps Copilot's persisted provider evidence path reads both:
- provider_sync_entities for providers using the generic sync contract.
- github_synced_entities for GitHub's existing connector, normalized into the same evidence shape at read time.

Microsoft 365, Jira, and Slack are wired into the scheduled pg-boss enqueue path and internal worker handler. Jira and Slack use their existing OAuth token refresh paths and the generic idempotent upsert/reconciliation contract. Microsoft 365 uses the existing Microsoft Graph connector health + sync contract.

The repository still explicitly treats the pg-boss worker as **not verified as production-deployed**. The code path is implemented, but scheduled sync must not be described as live until the worker is deployed and health-checked.

## Providers not promoted by this phase

The following catalog providers remain **coming soon for the generic scheduled evidence path** and are not fabricated as synchronized data:

aws, azure, gcp, google-workspace, freshworks, zendesk, salesforce, zoho, hubspot, gitlab, confluence, rubrik, veeam, cohesity, crowdstrike, microsoft-defender, okta, datadog, newrelic, splunk, pagerduty, workday, sap, oracle, snowflake, mongodb, servicenow.

Existing provider-specific authentication or isolated capability code is not treated as persisted Copilot evidence unless it writes to the evidence contract.

## Not-synced state

A connected provider with no successful persisted sync has no provider evidence. The application must surface that absence as unavailable/not synced rather than fabricate records.
