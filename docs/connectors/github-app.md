# GitHub App installation

Aegis connects GitHub through an installed GitHub App. Aegis does not accept or persist GitHub personal access tokens or GitHub OAuth access tokens for this integration.

## Production GitHub App settings

For the Aegis production deployment:

- Homepage URL: `https://aegis-clarity-nexus.lovable.app`
- Setup URL: `https://aegis-clarity-nexus.lovable.app/integrations/github/setup`
- Redirect URI: not required for the Setup URL installation flow
- Request user authorization (OAuth) during installation: off
- Webhooks: off until a webhook endpoint is intentionally enabled
- Installation target: start with the Aegis owner account only

Use the least-privilege repository permissions configured for the Aegis product. The initial production integration needs repository metadata plus read access to Actions, code scanning, and Dependabot alerts, and read/write access to Issues for governed remediation.

## Server environment

Configure these values in the Lovable production server secrets. Never put them in browser code, source control, or chat:

- `GITHUB_APP_ID` — numeric GitHub App ID.
- `GITHUB_APP_SLUG` — the GitHub App slug from the App's GitHub URL.
- `GITHUB_APP_PRIVATE_KEY` — the PEM private key downloaded when the GitHub App is created. Server-only.
- `GITHUB_APP_STATE_SECRET` — optional dedicated secret for signing short-lived install state. If omitted, Aegis derives a state-signing key from `AEGIS_CREDENTIAL_ENCRYPTION_KEY`.
- `AEGIS_CREDENTIAL_ENCRYPTION_KEY` — existing 32-byte hex credential-encryption key required to encrypt provider credentials. This must be stable; changing it makes previously encrypted integration credentials unreadable.

## Connection lifecycle

1. An authenticated Aegis admin/manager starts GitHub connection from Integrations.
2. Aegis creates short-lived, tenant/user-bound signed state and redirects to the GitHub App installation page.
3. The GitHub user selects the account and repositories available to the installation.
4. GitHub redirects to the Setup URL with installation metadata.
5. Aegis verifies the installation with a GitHub App JWT and confirms repository reachability using an installation token.
6. Aegis persists only the encrypted installation identity and account metadata. Short-lived installation access tokens are minted server-side when needed.
7. Sync reads `/installation/repositories`, not `/user/repos`, so Aegis sees only repositories granted to the installed App.

All GitHub writes remain behind the existing Aegis authorization, approval, execution, verification, and audit pipeline.
