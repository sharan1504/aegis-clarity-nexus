# Advanced Aegis AI features

## MCP change proposals

`propose_change_record` is the only MCP write surface. It accepts proposal content only and always creates a `Proposed` change with a `pending` approval row and manual execution mode. It is wrapped by the unified guardrail gateway as `low_risk`; the handler also ignores any lifecycle fields supplied outside the schema.

## Provider-aware reports

Reports use real Genesys telemetry plus synchronized provider entities. GitHub repositories, Jira projects/issues and Slack workspace/channel records are synchronized through `provider_sync.functions.ts`. Missing or stale provider data is omitted. No zero/placeholder rows are generated. The DevOps Health template requires real GitHub/Jira synchronized evidence.

## Cross-provider correlations

Chat correlation is evidence-backed only. The first implementation detects temporal alignment between synchronized GitHub repository activity and Jira issue updates within 24 hours. It explicitly describes this as temporal alignment and never claims causation. If no qualifying pair exists, the correlated-signals section is omitted.

## Outbound webhooks

Webhook subscriptions are tenant-scoped and admin-managed. Audit-log inserts enqueue matching events asynchronously. The dispatcher signs payloads with HMAC-SHA256, records every attempt, retries transient failures with backoff, and never participates in the originating transaction. Webhook secrets are never selected by authenticated clients.

Production deployment requires the Supabase Vault secrets `aegis_webhook_dispatch_url` and `aegis_webhook_dispatch_secret` used by the pg_cron job, plus the matching `WEBHOOK_DISPATCH_SECRET` Edge Function environment variable.
