# Aegis durable job queue

Aegis uses pg-boss on the existing PostgreSQL database for durable provider sync, webhook delivery, and external-ticket jobs. pg-boss creates and migrates its `pgboss` schema when the worker starts; the worker requires a database role with CREATE privilege on the database.

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
- `PROVIDER_SYNC_INTERNAL_URL`
- `PROVIDER_SYNC_INTERNAL_SECRET`
- `EXTERNAL_TICKET_INTERNAL_URL` and `EXTERNAL_TICKET_INTERNAL_SECRET` when external-ticket jobs are enabled

Supabase Edge schedulers call `POST /enqueue` on this worker using `Authorization: Bearer $AEGIS_JOB_QUEUE_SECRET`. Every payload carries `tenantId`; pg-boss group concurrency and singleton keys are tenant-scoped.

Queues use five total attempts (initial attempt + four retries), exponential backoff starting at 30 seconds, and dedicated dead-letter queues. The application tables remain the source of tenant-visible delivery/sync status; pg-boss is the durable execution layer.

## Operational requirement

The worker is a persistent Node 22 process. It must run alongside the application deployment rather than inside a short-lived Supabase Edge Function. Edge Functions only discover due work, claim it, and enqueue it; side effects execute in the worker.
