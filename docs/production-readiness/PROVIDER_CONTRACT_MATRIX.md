# Provider Contract Inventory

This matrix is generated from the current `PROVIDER_REGISTRY` and verified server-side integration modules. It is a planning and integrity artifact: registry metadata or auth code alone does not make a provider contract-complete.

Status meanings:
- **Auth** = a real server-side authentication/credential path exists in the repository.
- **Health** = a real provider API health/read check is implemented.
- **Sync** = a real persisted read/sync path exists, including pagination where implemented and failure propagation.
- **Stale** = missing entities can be marked stale/deleted during reconciliation.
- **Contract** = the provider is admitted to generic production read/sync and Connected can only be evidence-derived.
- **Writes** = governed external mutation support. `Unsupported` is intentional until Act→Verify is complete.

| Provider | Registry | Auth evidence | Credential storage | Health | Sync | Stale | Contract | Writes |
|---|---|---|---|---|---|---|---|---|
| genesys | yes | `src/lib/genesys/instance-oauth.server.ts`, `src/lib/integrations-genesys.functions.ts` | encrypted integration/OAuth storage | yes | yes | yes | yes (dedicated path) | dedicated mutations; generic contract not claimed |
| aws | yes | `src/lib/integrations/production-connectors.server.ts`, `aws-credentials.ts` | encrypted `provider_connections` | auth/STS validation only; domain health/sync incomplete | incomplete | incomplete | no | Unsupported |
| azure | yes | `src/lib/integrations/production-connectors.server.ts` | encrypted `provider_connections` | subscription read during validation | incomplete | incomplete | no | Unsupported |
| gcp | yes | partial/provider research only; no verified generic production connector identified in current inventory | not yet promoted | no verified contract health | no verified contract sync | no | no | Unsupported |
| m365 | yes | `src/lib/microsoft365/connector.server.ts`, Entra client credentials | encrypted `provider_connections` | yes | yes | yes | yes | Unsupported |
| google-workspace | yes | provider-specific auth implementation present in repository | OAuth framework/credential vault | no verified generic health | no verified generic sync | no | no | Unsupported |
| jira | yes | `src/lib/integrations/oauth-jira.server.ts` | encrypted OAuth storage | yes | yes | yes | yes | Unsupported |
| servicenow | yes | `src/lib/integrations/oauth-servicenow.server.ts` / production connector path | encrypted OAuth storage | yes | yes | yes | yes | Unsupported |
| freshworks | yes | `src/lib/integrations/oauth-freshworks.server.ts` (auth path) | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| zendesk | yes | `src/lib/integrations/oauth-zendesk.server.ts` (auth path) | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| salesforce | yes | `src/lib/integrations/oauth-salesforce.server.ts` | encrypted OAuth storage | yes | yes | yes | yes | Unsupported |
| zoho | yes | `src/lib/integrations/oauth-zoho.server.ts` | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| hubspot | yes | provider auth module present | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| slack | yes | `src/lib/integrations/oauth-slack.server.ts` | encrypted OAuth storage | yes | yes | yes | yes | Unsupported |
| github | yes | GitHub App installation path | encrypted installation identity | yes | yes | yes | yes | Create issue only through governed Act→Verify |
| gitlab | yes | `src/lib/integrations/oauth-gitlab.server.ts` | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| confluence | yes | provider-specific OAuth path | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| rubrik | yes | `src/lib/integrations/oauth-rubrik.server.ts` | encrypted client credentials | no verified generic health | no verified generic sync | no | no | Unsupported |
| veeam | yes | `src/lib/integrations/oauth-veeam.server.ts` | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| cohesity | yes | auth path exists/needs verification | provider credential vault | no verified generic health | no verified generic sync | no | no | Unsupported |
| crowdstrike | yes | `src/lib/integrations/oauth-crowdstrike.server.ts` | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| microsoft-defender | yes | `src/lib/integrations/oauth-defender.server.ts` | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| okta | yes | `src/lib/integrations/api-okta.server.ts` | server credential path | no verified generic health | no verified generic sync | no | no | Unsupported |
| datadog | yes | provider auth module present | server credential path | no verified generic health | no verified generic sync | no | no | Unsupported |
| newrelic | yes | `src/lib/integrations/api-newrelic.server.ts` / OAuth module | server credential path | no verified generic health | no verified generic sync | no | no | Unsupported |
| splunk | yes | provider auth module present | server credential path | no verified generic health | no verified generic sync | no | no | Unsupported |
| pagerduty | yes | provider auth module present | server credential path | no verified generic health | no verified generic sync | no | no | Unsupported |
| workday | yes | provider auth module present | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| sap | yes | `src/lib/integrations/oauth-sap.server.ts` | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| oracle | yes | `src/lib/integrations/oauth-oracle.server.ts` | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| snowflake | yes | provider auth module present | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |
| mongodb | yes | `src/lib/integrations/oauth-mongodb.server.ts` | encrypted OAuth storage | no verified generic health | no verified generic sync | no | no | Unsupported |

## Current inventory conclusion

The repository has substantially more **authentication implementations** than **contract-complete providers**. The production contract must therefore grow from verified connector implementations, not from `PROVIDER_REGISTRY` membership or auth-module presence alone.

Phase 1 of the provider expansion makes contract admission capability-driven and keeps all providers without verified health+sync evidence out of `connected` state. Phase 2 promotes providers only after real health, sync and stale reconciliation are wired and tested.
