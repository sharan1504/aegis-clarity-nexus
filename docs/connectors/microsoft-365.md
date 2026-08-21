# Microsoft 365 / Entra ID connector

Aegis now includes a real, read-only Microsoft Graph connector for production customer tenants.

## What it reads

- Entra ID users
- Microsoft 365 subscribed SKUs
- User-to-SKU license assignments
- SKU capacity/consumption metadata where Graph exposes it

It intentionally does not modify users or licenses. Usage/activity analytics are not claimed by this connector unless a future Graph capability is explicitly added.

## Customer setup

Create an Entra application registration in the customer's tenant and grant **Application** permission:

- `LicenseAssignment.Read.All` — least-privileged permission for reading license assignments and subscribed SKUs.
- `User.Read.All` — required to enumerate users and their directory profiles.

Admin consent is required for these application permissions. Microsoft documents `LicenseAssignment.Read.All` as the least-privileged application permission for subscribed SKUs, and `User.Read.All` for listing users. See Microsoft Graph permission references before production rollout.

The customer supplies, through Aegis's server-side secret store:

- `tenantId`
- `clientId`
- `clientSecret`

For the initial single-tenant deployment, these can be supplied as server-only environment secrets:

- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`

Do not put any of these values in browser code, Git, Lovable UI state, or LLM prompts.

## Runtime behavior

The connector uses Microsoft Entra OAuth 2.0 client credentials to obtain a Graph token, then reads `/users` and `/subscribedSkus` with pagination. It maps the results into the provider-neutral Aegis `User`, `License`, and `Assignment` entities.

The connector computes a SHA-256 data version from the normalized snapshot. The scheduled sync engine can use that version to invalidate/rotate cached answers.

## Production hardening before multi-tenant launch

For a multi-tenant SaaS deployment, store each customer's tenant/client credentials in a dedicated server-side secret store and resolve the connection by Aegis tenant. Do not use process environment variables for multiple customers. Rotate client secrets/certificates and audit every connection/sync operation.
