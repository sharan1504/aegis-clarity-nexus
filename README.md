# Aegis AI

Aegis AI is an **AI Operations and Governance control plane** for enterprise environments. It connects real provider evidence, AI agents, analytics, guardrails, approvals, investigations, auditability and governed actions into one operational loop.

Aegis is not intended to be another generic workflow marketplace. Its job is to help an enterprise answer: **is our AI operating correctly, safely, efficiently and with measurable outcomes — and what governed action should happen next?**

See [`docs/product/Aegis-Control-Plane.md`](docs/product/Aegis-Control-Plane.md) for the product direction and architectural boundary.

## Tech stack

- React 19
- TanStack Start + TanStack Router
- TypeScript
- Supabase/PostgreSQL with Row Level Security
- Vitest for tests
- Vite for development and production builds
- Tailwind CSS and Radix UI primitives

## Run locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Run linting:

```bash
npm run lint
```

Run tests:

```bash
npm test
```

Create a production build:

```bash
npm run build
```

## Architecture at a glance

Aegis is tenant-scoped. Authenticated users resolve to a tenant and access is enforced through server authorization and Supabase Row Level Security.

- **Command Center** — evidence-first operational control plane for attention, posture, risk and the Observe → Govern → Optimize → Act → Verify loop.
- **Integrations** — provider instances with independent credentials, OAuth state, synchronization, health and external identifiers. Multiple instances of the same provider are supported conceptually per tenant.
- **AI Agents** — tenant agent definitions and real integration bindings, with governed enable/disable behavior.
- **Guardrails** — policy controls that evaluate governed operations before execution.
- **Change records and approvals** — proposed changes move through review and approval before authorized external writes.
- **Investigations** — evidence-backed operational findings that connect recommendations to changes, sync freshness and audit context.
- **Audit log** — append-only, tenant-scoped records provide an immutable operational history.
- **Analytics** — tenant telemetry and synchronized provider evidence are used for operational analysis, segmentation and outcome measurement.
- **Chat Assistant** — natural-language access to the evidence and investigation workflow, subject to tenant and department authorization.

Provider reads and writes are server-authorized and tenant-scoped. External mutations are expected to follow the approval and audit pipeline rather than being initiated directly from presentation-layer state.

## Operational principles

1. Prefer persisted tenant evidence for initial page rendering; expensive provider calls should be explicit or background synchronization work.
2. Never present fabricated or mock-looking business data as tenant evidence.
3. A failed provider operation must remain visibly failed; it must not become a successful-looking empty state.
4. Recommendations are not approvals, and approvals are not proof of execution or business outcome.
5. Correlations and savings estimates require underlying evidence.
6. Every external mutation must remain tenant-scoped, server-authorized and auditable.

## Production readiness

Current provider implementation status, data-integrity requirements, and remaining production work are maintained in [`docs/production-readiness/`](docs/production-readiness/).

Start with [`IMPLEMENTATION_STATUS.md`](docs/production-readiness/IMPLEMENTATION_STATUS.md) for the authoritative current status.

## Data integrity principle

Aegis should prefer an explicit unavailable/not-implemented state over fabricated, seeded, or mock-looking production data. Provider failures should be surfaced rather than converted into successful-looking results.
