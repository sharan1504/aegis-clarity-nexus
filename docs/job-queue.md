# Aegis durable job queue

Aegis uses pg-boss on the existing PostgreSQL database for durable provider sync, webhook delivery, and external-ticket jobs. pg-boss creates and migrates its `pgboss` schema when the worker starts; the worker requires a database role with CREATE privilege on the database.

## Production deployment status

**The Node worker is not currently verified as deployed in production and is intentionally treated as disabled until a persistent worker host/process manager is provisioned.** There is no Docker/ECS/Kubernetes/VM/process-manager deployment configuration in this repository, so the source file alone must not be interpreted as a running production component.

The Edge Functions already fail closed when `JOB_QUEUE_URL` or `AEGIS_JOB_QUEUE_SECRET` is missing; they do not silently claim that a durable queue exists. Production must not configure those variables until a real worker endpoint is deployed and health-checked.

## Worker

Run:

```bash
npm run worker
```

Required environment:

- `PGBOSS_DATABASE_URL` (preferred) or `DATABASE_URL`
- `PGBOSS_SCHEMA` (optional, defaults to `pgboss`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AEGIS_JOB_QUEUE_SECRET`
- `AEGIS_JOB_WORKER_PORT` (optional, defaults to `8787`)
- `PROVIDER_SYNC_INTERNAL_URL` — the application URL for `POST /api/internal/provider-sync`
- `PROVIDER_SYNC_INTERNAL_SECRET` — shared only between the worker and application server
- `EXTERNAL_TICKET_INTERNAL_URL` and `EXTERNAL_TICKET_INTERNAL_SECRET` when external-ticket jobs are enabled

Supabase Edge schedulers call `POST /enqueue` on this worker using `Authorization: Bearer $AEGIS_JOB_QUEUE_SECRET`. Every payload carries `tenantId`; pg-boss group concurrency and singleton keys are tenant-scoped.

The provider-sync worker currently dispatches GitHub jobs to `/api/internal/provider-sync`. That endpoint validates the worker secret, accepts only registered providers, retrieves the tenant-scoped encrypted GitHub credential server-side, and runs the provider's real sync implementation. GitHub scheduled syncs are discovered from connected `provider_connections` and are throttled to one enqueue window per 15 minutes per connection.

Queues use five total attempts (initial attempt + four retries), exponential backoff starting at 30 seconds, and dedicated dead-letter queues. The application tables remain the source of tenant-visible delivery/sync status; pg-boss is the durable execution layer.

## Safe enablement checklist

Do not enable durable scheduling merely by setting queue environment variables. Before enabling it in production:

1. Provision a persistent Node 22 worker host/process manager (or an equivalent container deployment) outside short-lived Edge Functions.
2. Configure `PGBOSS_DATABASE_URL`/`DATABASE_URL` with a role permitted to create/manage the pg-boss schema and verify connectivity from the worker host.
3. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `AEGIS_JOB_QUEUE_SECRET` only in the worker secret store.
4. Configure the application-side `JOB_QUEUE_URL` and `AEGIS_JOB_QUEUE_SECRET` only after the worker endpoint is reachable over the intended private/authenticated path.
5. Configure and verify `PROVIDER_SYNC_INTERNAL_URL` and its shared secret; never expose the internal sync endpoint without its server-side authentication.
6. Start the worker and verify its health/readiness endpoint, process restart behavior, queue connection, and pg-boss schema migration.
7. Enqueue a non-destructive test job for a tenant with a real contract-backed provider and confirm the application records the expected sync evidence.
8. Confirm failures retry and land in the expected dead-letter path, and that tenant-visible status reports the failure rather than a false success.
9. Only then enable production schedules. Record the worker host/deployment and verification evidence in the operations runbook.

If any prerequisite is missing, leave durable scheduling disabled. Manual `Sync Now` remains the supported path for contract-backed provider syncs and must not depend on the worker.

## Operational requirement

When enabled, the worker is a persistent Node 22 process. It must run alongside the application deployment rather than inside a short-lived Supabase Edge Function. Edge Functions only discover due work, claim it, and enqueue it; side effects execute in the worker.
