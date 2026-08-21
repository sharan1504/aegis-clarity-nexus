grant select, insert, update, delete on public.webhooks to authenticated;
grant select on public.webhook_delivery_attempts to authenticated;
grant select on public.webhook_outbox to authenticated;

-- Secret remains hidden from browser consumers by the server functions: callers
-- never select it directly. PostgREST column-level grants are not relied upon
-- because the application uses an explicit server-side projection.
