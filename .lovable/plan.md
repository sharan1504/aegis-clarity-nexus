# CenOps chat history and latency workstreams

## Workstream A — Chat history delete UX
- Replace the hover-only delete action with an always-visible, keyboard-focusable icon action.
- Add an accessible confirmation dialog naming the conversation before deletion.
- Preserve the existing tenant/user-scoped server deletion and active-chat fallback behavior.
- Keep demo deletions in the existing per-user server-session store and make the narrow-screen history panel usable through the existing history control.

## Workstream B — Copilot latency
- Default new page sessions and omitted server inputs to Quick; retain Thorough as an explicit selector.
- Keep server model context capped to the recent persisted turns and cap client-submitted context as defense in depth.
- Add a ten-minute in-memory response cache only for stable product/platform request classes, isolated by tenant, environment mode, intent, and normalized request class; never cache evidence-backed or investigative answers.
- Retrieve independent evidence concurrently with soft-fail fallbacks so one unavailable source does not discard other authorized evidence.
- Refresh history once after each completed response, including first-message title updates without a second refresh.
- Record intent, evidence, model, persistence, and total timings through the existing investigation-step telemetry where available, with structured server logs as fallback.
- Keep response schemas, department constraints, Demo fixtures, Live evidence boundaries, guardrails, and approval semantics unchanged.

## Verification
- Add focused unit tests for cache tenant/environment isolation, expiry, cache eligibility, bounded context, and Quick/Thorough evidence policy.
- Run focused tests, the full test suite, lint, TypeScript checking, production build, and a browser check of delete confirmation and mobile history.
- Report pre-existing failures separately from introduced failures and provide the resulting commit identifier available from the managed workspace.

## Technical note
- The workspace is currently on the platform-managed edit branch. No manual branch switching or merge will be performed.
