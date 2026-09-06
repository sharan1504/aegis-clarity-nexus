# Aegis Mock Demo Contract

Aegis demo mode must exercise the same UI contracts as production without pretending that external systems were contacted.

## Required coverage

Mock/demo data must be available for every major workspace surface:
- Command Center
- Chat
- Customer Investigations / Resolution Evidence
- Vulnerability / Security
- Audit Review
- User Management
- Agents
- Integrations
- Analytics / Reports
- Governance / Change Records

## Rules

1. Demo data is deterministic and tenant-scoped.
2. Demo mode never writes fake provider credentials or claims that an external API was called.
3. Mock tool calls must be explicitly marked `demo` and show realistic arguments, results, latency and status.
4. Customer-facing responses use the same resolution/evidence model as production.
5. Every UI action must exercise the same server-function/application contract used by production where practical.
6. Demo mode can simulate success, failure, approval-required and verification-required states.
7. Turning demo mode off must immediately fall back to live integration data; no demo rows should be persisted as live provider evidence.

## Agent configuration contract

An agent is a configurable workflow, not merely a deployment record.

Each agent definition contains:
- purpose and trigger
- workflow steps
- capabilities
- allowed tools
- selected integrations
- input/configuration fields
- guardrails and approval rules
- retry/error policy
- verification policy
- customer response policy

The configuration UI must support reusable templates for incident response, license optimization, security, vulnerability remediation and other agents while allowing tenant-specific customization.

## Evidence

Every simulated or live workflow step should correlate:
`tenant -> agent -> run -> step -> tool invocation -> evidence -> action -> verification -> customer response`.
