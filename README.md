# Aegis AI

Aegis AI is an enterprise operations platform for governed AI-assisted change management, provider integrations, approvals, auditability, and operational analytics.

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

- **Tenants and profiles** — workspace identity and tenant membership.
- **Guardrails** — policy controls that evaluate governed operations before execution.
- **Change records and approvals** — proposed changes move through review and approval before authorized external writes.
- **Audit log** — append-only, tenant-scoped records provide an immutable operational history.
- **Connectors** — provider integrations expose real provider-backed synchronization and external operations; a provider is not treated as connected unless its implementation and synchronization requirements are satisfied.
- **Analytics and reports** — tenant telemetry and synchronized provider evidence are used for operational analysis and exports.

Provider reads and writes are server-authorized and tenant-scoped. External mutations are expected to follow the approval and audit pipeline rather than being initiated directly from presentation-layer state.

## Production readiness

Current provider implementation status, data-integrity requirements, and remaining production work are maintained in [`docs/production-readiness/`](docs/production-readiness/).

Start with [`IMPLEMENTATION_STATUS.md`](docs/production-readiness/IMPLEMENTATION_STATUS.md) for the authoritative current status.

## Data integrity principle

Aegis should prefer an explicit unavailable/not-implemented state over fabricated, seeded, or mock-looking production data. Provider failures should be surfaced rather than converted into successful-looking results.
