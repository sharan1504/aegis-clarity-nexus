# Aegis AI feature backlog implementation contract

This branch implements the requested integrity rules: live tenant data only, real provider-derived estimates only, tenant-scoped writes, server-side authorization, transparent server-derived risk factors, and explicit unavailable states where a provider capability is not implemented.

## Completed architecture changes
- Marketplace is intended to expose undeployed definitions; deployment is validated against real connected provider capabilities.
- Chat recommendations can create tenant-scoped change records and mark the recommendation as sent to approvals.
- Change records support nullable cost/savings/downtime estimates. NULL is explicitly not estimated.
- Provider integrations have independent attempt/success/error sync state and configurable intervals.
- Scheduled sync dispatches only connected non-mock integrations and delegates to the same real provider sync service; missing configuration fails visibly rather than fabricating data.
- Risk records can carry structured server-computed factor weights/contributions/evidence; the client only renders stored breakdown data.
- Tenant setup state is derived from connected real providers, enabled real bindings, and enabled tenant guardrails.

## Explicit non-claims
Unsupported providers/capabilities are not treated as implemented. Rollback is not considered executable unless a real reversible provider operation exists. External notifications are not considered configured unless a real authorized integration exists.
