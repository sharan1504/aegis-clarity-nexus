# Live License Analysis denial — traced root cause

## Runtime path

```text
LicenseAgentLiveAnalysis (button click)
  -> executeLicenseAgent (server fn, authenticated)
       runs BOTH operations in parallel:
         get_license_summary            -> license_inventory + user_inventory
         get_unused_license_candidates  -> license_inventory + user_inventory + queue_inventory
  -> capabilityRouter.getLicenseInventory / getUsers / getQueues
  -> authorizeCapabilityAccess (fail-closed, per capability)
  -> DENIAL_MESSAGES[reason] surfaced verbatim in the red "Analysis failed" alert
```

The component sets the error from whichever operation fails first (summary checked first, then candidates), so a single denied capability blanks the whole panel.

## Where the exact message comes from

`src/lib/capabilities/authorization.server.ts` maps `binding_disabled` to the literal string "The data source is disabled for this agent." It is returned in step 5 when bindings exist for tenant + agent + capability but **none of them is enabled** (`enabled.length === 0` and at least one disabled row).

## Why it disagreed with the DB state you checked

Two separate capability gaps, not one:

1. `user_inventory` — before the binding added earlier today, `agent-license` had exactly one `user_inventory` binding: the AWS mock integration, `enabled = false`. That produced `binding_disabled` — the exact message. The verified "enabled non-mock Genesys license_inventory binding" satisfied only the first of the two capabilities `get_license_summary` needs. This is now fixed in the database (Genesys `user_inventory` binding enabled), so this specific message should no longer appear after a fresh click of "Analyze live data" (results are held in component state, so the old error persists until the button is pressed again).
2. `queue_inventory` — still blocking, and it is not a binding problem. `agent_capabilities` has only 2 rows for `agent-license` (`license_inventory`, `user_inventory`); there is no `queue_inventory` row for any agent, and no `queue_inventory` binding exists at all. `get_unused_license_candidates` calls `capabilityRouter.getQueues`, so `authorizeCapabilityAccess` fails at step 4 with `capability_not_assigned_to_agent` -> "This agent does not support that capability." Genesys does implement `queue_inventory` (`provider_capabilities.implemented = true`), so nothing at the connector level is missing.

No stale hard-coded ids, no tenant mismatch, no caching layer, and no guardrail is involved: tenant, integration and provider are all resolved per request from the session.

## Recommended minimal fix

Data-only, no application-code change:

1. Add the missing agent↔capability assignment: `agent_capabilities` row for `agent-license` + `queue_inventory` with `required = false` (it is a supporting exclusion signal, not a hard requirement).
2. Add and enable the `agent-license` -> `queue_inventory` -> Genesys binding in the current tenant (non-mock), matching the two existing Genesys bindings.
3. Verify by querying `agent_capabilities` and `agent_integration_bindings`, then re-run "Analyze live data" in the preview and confirm both cards render.

Note on behaviour after the fix: the normalized queue capability exposes queue-level facts, not per-user membership, so `activeQueueMemberUserIds` stays empty and any policy that requires the active-queue-member exclusion will still report those candidates as inconclusive. That is the intended fail-closed behaviour, not an error.

### Alternative (if you prefer no new capability grant)

Change `get_unused_license_candidates` to treat `queue_inventory` as optional — degrade with a warning instead of denying when the queue capability is unauthorized. This is a code change to `src/lib/agents/license/functions.ts` and weakens the current strict all-or-nothing contract, so it is offered only as a fallback.
