# Integrations Catalog reliability and logo correction

## Scope
- Fix the production Connect action across every provider without changing connector behavior, provider contracts, Help Center links, or callback implementations.
- Correct all catalog provider logos without redesigning the catalog.

## Connect-flow implementation
1. Trace each provider from the catalog button through its exact server function, return shape, redirect or direct verification result, and callback route.
2. Replace direct route-component calls to server functions with `useServerFn` wrappers and a single `useMutation` connection workflow, following the working Genesys integration pattern.
3. Replace untyped shared-form casts with typed provider-specific payload builders matching every input validator exactly.
4. Keep OAuth, GitHub App, and direct-credential paths separate:
   - OAuth redirects only for a validated authorization URL.
   - GitHub redirects only for a validated installation URL.
   - Credential/service-account providers verify directly and display success or the actual error.
5. Make the action explicitly `type="button"`, label credential/service-account actions “Connect & verify,” and show real server/input errors in the panel and development console.
6. Verify every returned URL maps to an existing callback route, especially Genesys, Workday, and SAP.

## Logo correction
1. Inventory every provider in the registry and its current source.
2. Replace broken, generic, or mismatched remote imagery with trustworthy official brand artwork stored locally, using one distinct asset per provider.
3. Keep the existing logo frame, sizing, aspect ratio, lazy loading, fallback, and accessible provider labeling.
4. Add a focused registry check for unique, existing local logo paths.

## Verification
- Add focused tests for provider payload routing, result handling, callback coverage, and logo mappings where the current test structure permits.
- Run focused tests, full tests, lint, typecheck, and production build; report exact pass/fail output.
- Exercise the catalog in preview at desktop and mobile widths, including representative OAuth, GitHub, and credential actions, and inspect browser console/network failures.
- Review the final diff and report root causes, complete provider/logo inventory, changed files, and current commit SHA. Repository history will remain untouched because workspace Git state is platform-managed.

## Constraints
- No database changes.
- No provider callback handler edits unless investigation proves a route mismatch that cannot be fixed at the caller.
- No unrelated changes or catalog redesign.
