# Cenops enterprise visual-system redesign

## Goal
Redesign Cenops as a cohesive, premium AI operations control plane while preserving every existing feature, route, permission, workflow, integration, and data behavior.

## Central visual system
- Rework the semantic light and dark theme tokens first: midnight/graphite surfaces, restrained indigo primary, cyan information, emerald success, clearer surface elevation, borders, focus rings, and professional chart colors.
- Add shared visual utilities for the calm atmospheric workspace background, technical grid treatment, compact section labels, focused panels, and reduced-motion-safe interaction states.
- Refine shared cards, buttons, fields, badges, tables, tabs, dialogs, skeletons, charts, and sidebar primitives so existing screens inherit the new system without page-level color hard-coding.
- Preserve the current dark identity while giving light mode its own cool, high-contrast enterprise palette.

## Application shell
- Upgrade the sidebar branding, grouping, active-state treatment, spacing, and collapsed presentation using only existing destinations.
- Refine the top bar around search, workspace/environment status, role, theme, notifications, user identity, and sign-out.
- Improve the content workspace width, responsive spacing, page-title hierarchy, and loading presentation across desktop, tablet, and mobile.

## Major screens
- Command Center: strengthen the control-room hierarchy across current findings, attention signals, agent activity, approvals, and verified activity without inventing data.
- Agentic Studio and Agents: emphasize identity, purpose, data access, tools, guardrails, evaluation, and relationships with subtle topology motifs.
- Approval Center: style the existing lifecycle and evidence as a governance gate with stronger risk, stage, affected-system, reasoning, and audit hierarchy.
- Integrations: create denser provider panels with concise health, capability, environment, sync, and action presentation.
- Analytics, Settings, Audit, and Reports: apply the same surfaces, typography, controls, tables, charts, and status language; keep Settings intentionally quieter.
- Authentication: replace the current broad gradient treatment with a midnight/graphite entry experience and an original connected-systems visual that remains visible at laptop widths and never collapses into an empty mobile canvas.

## Responsive and accessibility verification
- Check the shared shell and representative major screens at 1440, 1280, 1024, 900, 768, and mobile widths.
- Verify text fit, navigation collapse, chart sizing, stacked cards, focus visibility, reduced motion, and light/dark contrast.
- Run the project lint, full test suite, production build, and browser-based visual checks.

## Google sign-in branding
- The current Google sign-in uses Lovable-managed OAuth credentials. Changing Google’s account-picker branding requires a Cenops-owned Google OAuth client and cannot be completed from the connected services currently available here.
- Keep sign-in behavior unchanged during the visual redesign.
- Once a Cenops-owned Google client ID and secret exist, configure them through Lovable Cloud Authentication Settings, using Cenops app name/logo/support email/privacy/terms and the callback URL shown there.
- Verify end to end that Google displays “continue to Cenops.” Google review may be required depending on publishing status and requested scopes.

## Scope safeguards
- No business logic, APIs, database schema/data, authentication flow, routing, agents, integrations, workflows, or feature names will change.
- No stock photography, copied branding, fabricated metrics, or invented routes will be introduced.
- Deployment and domain wiring remain untouched.
