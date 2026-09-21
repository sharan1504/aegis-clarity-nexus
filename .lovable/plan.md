# Integrations Catalog logo correction

## Scope
- Audit all 32 providers declared by the existing catalog registry and preserve their IDs, names, categories, descriptions, authentication, capabilities, availability, links, routes, and connector behavior.
- Replace broken, generic, duplicated, or mismatched imagery only; do not redesign catalog cards or other Integrations screens.

## Implementation
1. Build a provider-by-provider logo inventory from the registry and current assets, including source validity and duplicate checks.
2. Store one trustworthy official brand mark per provider as a local catalog asset. Prefer the official brand’s published artwork; use established brand-icon artwork only where the provider does not publish a directly reusable asset.
3. Update only each provider’s `logoUrl` mapping. Keep the existing fixed logo frame, `object-contain` sizing, lazy loading, and fallback behavior.
4. Give rendered logos meaningful provider-specific alternative text while keeping decorative duplication out of assistive output where the provider name is already adjacent.
5. Add a focused registry test that verifies every provider has a unique existing local logo path and that no catalog mapping uses an unavailable remote URL.

## Verification
- Run the focused logo/registry tests and the project’s existing relevant tests.
- Open the Integrations Catalog at desktop and mobile widths, confirm all 32 official marks render, and check browser image failures and layout consistency.
- Report the complete provider-to-logo inventory and exact changed files.

## Technical notes
- No database, API, OAuth, connector contract, provider metadata beyond `logoUrl`, callback, Help Center, or routing changes.
- Local assets avoid third-party CDN failures such as the currently broken AWS, Azure, Microsoft 365, Freshworks, Salesforce, Slack, Workday, and Oracle URLs.
