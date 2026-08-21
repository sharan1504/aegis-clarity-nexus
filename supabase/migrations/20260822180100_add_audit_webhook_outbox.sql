create table if not exists public.webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  audit_log_id uuid not null references public.audit_log(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','delivered','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.webhook_outbox enable row level security;
create policy webhook_outbox_admin_select on public.webhook_outbox
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_tenant_role(tenant_id, 'admin'));
create index if not exists webhook_outbox_due_idx on public.webhook_outbox(status, next_attempt_at);

create or replace function public.enqueue_audit_webhooks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.webhook_outbox (tenant_id, webhook_id, audit_log_id, event_type, payload)
  select w.tenant_id,
         w.id,
         new.id,
         new.action,
         jsonb_build_object(
           'id', new.id,
           'event', new.action,
           'tenantId', new.tenant_id,
           'entityType', new.entity_type,
           'entityId', new.entity_id,
           'detail', new.detail,
           'payload', new.payload,
           'actorEmail', new.actor_email,
           'actorRole', new.actor_role,
           'createdAt', new.created_at
         )
  from public.webhooks w
  where w.tenant_id = new.tenant_id
    and w.enabled
    and new.action = any(w.event_types);
  return new;
end;
$$;

drop trigger if exists audit_log_webhook_enqueue on public.audit_log;
create trigger audit_log_webhook_enqueue
after insert on public.audit_log
for each row execute function public.enqueue_audit_webhooks();

revoke all on public.webhooks from authenticated;
revoke all on public.webhook_outbox from authenticated;
revoke all on public.webhook_delivery_attempts from anon;
