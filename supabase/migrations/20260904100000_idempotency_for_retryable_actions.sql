-- Item 1: tenant-scoped idempotency for retryable side effects.

alter table public.provider_sync_runs
  add column if not exists idempotency_key text;

alter table public.webhook_delivery_attempts
  add column if not exists idempotency_key text;

create unique index if not exists provider_sync_runs_tenant_idempotency_key_uq
  on public.provider_sync_runs(tenant_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists webhook_delivery_attempts_tenant_idempotency_key_uq
  on public.webhook_delivery_attempts(tenant_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.external_ticket_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  change_record_id uuid not null references public.change_records(id) on delete cascade,
  system text not null check (system in ('Jira', 'ServiceNow')),
  idempotency_key text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

alter table public.external_ticket_actions enable row level security;

create policy external_ticket_actions_tenant_select
  on public.external_ticket_actions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create index if not exists external_ticket_actions_change_lookup_idx
  on public.external_ticket_actions(tenant_id, change_record_id, created_at desc);

create or replace function public.set_external_ticket_action_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists external_ticket_actions_updated_at on public.external_ticket_actions;
create trigger external_ticket_actions_updated_at
before update on public.external_ticket_actions
for each row execute function public.set_external_ticket_action_updated_at();

revoke all on public.external_ticket_actions from anon;
grant select on public.external_ticket_actions to authenticated;
grant all on public.external_ticket_actions to service_role;
