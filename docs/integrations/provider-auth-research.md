# CenOps provider authentication research

This document is intentionally provider-specific. It is not an OAuth abstraction contract. Each provider implementation must follow the vendor's documented authentication model, endpoints, scopes, tenant/account model, token lifecycle, and revocation semantics.

## Decision rules

- Do not infer authentication from the current provider registry.
- Do not label a provider OAuth merely because its API accepts bearer tokens.
- Prefer vendor-recommended production authentication over legacy API keys where the vendor documents a newer mechanism.
- Store authorization state server-side and single-use; never put client secrets or tokens in callback URLs.
- Provider modules own authorization URL construction, token exchange, refresh/revocation, account identity discovery, and provider-specific validation.

## Current research

| Provider | Vendor-documented model | CenOps implementation decision | Evidence / remaining work |
|---|---|---|---|
| Google Cloud | Google OAuth 2.0 web-server authorization code supports scopes, redirect URI, access/refresh tokens and offline access. | Dedicated Google Cloud OAuth module; use only scopes required by the selected Cloud APIs. | Official Google OAuth web-server docs. API/resource discovery still needs to be tied to the exact CenOps GCP telemetry surface. |
| Google Workspace | Google OAuth 2.0 and Workspace domain-wide delegation are separate models. Domain-wide delegation is admin-controlled service-account delegation. | Do not use one generic Workspace flow. Implement delegated admin OAuth for interactive connection and a separate DWD/service-account path only if CenOps requires tenant-wide background access. | Official Google OAuth + Workspace DWD docs. Exact Admin SDK/Drive scopes must be finalized per feature. |
| Freshworks | Freshservice supports OAuth; external apps use an authorization-code flow and vendor-specific `/oauth/v2/authorize` and `/oauth/v2/token` endpoints. API keys remain available for basic auth. | Dedicated Freshservice OAuth module. Keep API-key support separate and do not silently substitute it. | Freshworks external-app OAuth docs. Need final scope list for tickets/assets/SLA sync. |
| Zendesk | Authorization code is intended for user-facing/per-user integrations; client credentials is for secure background server-to-server integrations. Public clients can use PKCE. | Dedicated Zendesk OAuth module; default to authorization code for CenOps customer connection, with refresh-token handling. | Official Zendesk OAuth docs. Need exact scope set for Support objects and account identity endpoint. |
| Zoho | Zoho CRM documents OAuth 2.0 for production/partner integrations; access tokens expire and refresh is required. | Dedicated Zoho OAuth module with Zoho's regional accounts domain and CRM-specific scopes. | Official Zoho CRM docs. Need exact Accounts/CRM/Desk product scopes and DC selection. |
| HubSpot | New 2026-03 OAuth endpoints use authorization/install URL, token exchange, refresh, introspection and revoke. Access tokens expire after 30 minutes. | Dedicated HubSpot module implemented in this branch using the 2026-03 endpoints; introspection resolves Hub ID/user/scopes. | Official HubSpot 2026-03 OAuth docs. API object scopes must be reviewed as CenOps adds capabilities. |
| GitLab | OAuth supports authorization code with PKCE and server-side authorization code; scopes are application-selected. | Dedicated GitLab OAuth module; prefer PKCE and retain instance URL because GitLab can be self-managed/Dedicated. | Official GitLab OAuth docs. Need SaaS vs self-managed issuer/host UX. |
| Confluence | Atlassian 3LO authorization-code flow; account/resource grants and scopes are separate concerns. | Dedicated Atlassian/Confluence module; resolve accessible sites after token exchange and store site/cloud ID. | Official Atlassian Confluence 3LO docs. Need final Confluence scopes for read-only knowledge sync. |
| Rubrik | Rubrik Security Cloud exposes GraphQL/API Playground and service-account based programmatic access; CDM APIs can exchange service-account client credentials for access tokens. | Do not implement API-key assumption. Build an RSC service-account/client-credential module once the target RSC API and service-account token endpoint are fixed. | Official Rubrik docs confirm service-account access. Exact RSC GraphQL auth/token endpoint needs product-specific validation. |
| Veeam | Authentication differs by Veeam product/API and deployment model. | Do not implement generic OAuth/API-key flow until the exact Veeam product target is selected (Service Provider Console vs Veeam Data Platform APIs). | Vendor product-specific API research required. |
| Cohesity | Authentication is product/deployment-specific; current docs found in product guides do not establish a single SaaS OAuth model for CenOps. | Hold implementation until Cohesity Helios/DataProtect target API and current programmatic auth model are confirmed. | Vendor documentation requires product-specific research. |
| CrowdStrike | CrowdStrike OAuth2 API collection issues bearer access tokens; documented access tokens have a standard 30-minute lifetime and can be revoked. | Dedicated CrowdStrike OAuth2 client-credential/token module; retain cloud-region/base-host selection. | Official CrowdStrike OAuth2 API docs. Need exact API scopes/permissions and regional cloud host discovery. |
| Microsoft Defender | Defender APIs use Microsoft Entra OAuth2. Application context is recommended for background services; partner context uses multi-tenant Entra app + per-tenant admin consent. | Dedicated Entra/Defender module, separate from Microsoft 365. Use application context for CenOps background sync where supported. | Official Microsoft Defender API access docs. Exact Defender API resource permissions need feature-by-feature mapping. |
| Okta | Okta supports OAuth2 scopes, but OAuth is only supported by APIs that explicitly support OAuth; many APIs still use API tokens. | Dedicated Okta OAuth module only for OAuth-supported endpoints; never assume bearer OAuth covers every Okta API. | Official Okta OAuth docs. Need exact API surface/scopes for users/groups/apps/events. |
| Datadog | OAuth2 is available to approved Technology Partners building official Datadog integrations; standalone OAuth clients are not supported. | Do not expose a generic self-service OAuth flow until CenOps has Datadog Technology Partner authorization. | Official Datadog OAuth docs explicitly state this limitation. API/app keys remain a separate product capability. |
| New Relic | New Relic APIs use API keys; user keys are used for NerdGraph querying/configuration and license keys for ingest. | Dedicated New Relic API-key module, not OAuth. Store key type explicitly and validate with NerdGraph. | Official New Relic API-key docs. Need least-privilege key guidance for CenOps queries. |
| Splunk | Authentication depends on Splunk Cloud/Enterprise deployment and endpoint/API. | Do not assume API-key semantics. Research Splunk Cloud OAuth/token and management endpoint model before enabling. | Product/deployment-specific research required. |
| PagerDuty | PagerDuty exposes OAuth2 for integrations/apps as well as API access mechanisms. | Dedicated PagerDuty OAuth module once exact app model/scopes for incidents/services/schedules are confirmed. | Need current official developer OAuth page and scope list. |
| Workday | Workday documents OAuth authorization-code and client-credentials schemes; REST API access is additionally constrained by Workday security domains/business-process permissions. | Dedicated Workday module must capture tenant/API gateway URL and OAuth client configuration; validate access against the actual REST API set. | Official Workday developer docs. Tenant-specific gateway and scope/security setup must be captured in UX. |
| SAP | SAP authentication varies substantially by product/API runtime (BTP, S/4HANA, API Business Hub, IAS/XSUAA, etc.). | Do not implement a single SAP OAuth flow. Select the exact SAP product/API target first, then implement its documented issuer/client model. | Product-specific research required. |
| Oracle | Oracle Cloud Identity Domains expose OAuth2 token service for platform APIs; token lifetime and identity-domain URL are tenant-specific. | Dedicated OCI identity-domain OAuth module for APIs that support it; keep API signing/IAM auth separate where required. | Official Oracle OAuth token docs. Need exact OCI services/endpoints required by CenOps. |
| Snowflake | Snowflake has built-in OAuth and external OAuth. External OAuth uses the customer's IdP and maps scopes to Snowflake roles. | Dedicated Snowflake OAuth module must distinguish built-in OAuth from customer external OAuth. Do not assume a universal issuer. | Official Snowflake OAuth docs. Need target warehouse/account operations and account URL discovery. |
| MongoDB Atlas | Atlas Administration API now recommends OAuth2 service accounts using client credentials; API keys are legacy. Tokens are valid for 1 hour and are generated, not refreshed. | Dedicated MongoDB Atlas service-account module; collect client ID/secret and generate access tokens on demand. Do not model this as interactive authorization-code OAuth. | Official MongoDB Atlas authentication/API docs. Need organization/project selection after token validation. |

## Phase 1 code

The branch implements HubSpot as the first new provider-specific OAuth flow. It uses:

- `https://app.hubspot.com/oauth/authorize`
- `https://api.hubapi.com/oauth/2026-03/token`
- `https://api.hubapi.com/oauth/2026-03/token/introspect`
- `https://api.hubapi.com/oauth/2026-03/token/revoke`
- 30-minute access-token expiry with refresh-token renewal
- Hub ID/user/scopes from token introspection
- server-side, single-use CenOps OAuth state

The next provider implementations must be added as separate modules rather than extending a generic provider-auth switch.
