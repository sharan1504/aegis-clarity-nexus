-- Webhook RLS needs a tenant-scoped role helper. Define it before the
-- policies so a fresh database can apply this migration without relying on
-- another migration or an undeployed helper function.
create or replace function public.has_tenant_role(_tenant_id uuid, _role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.tenant_id = _tenant_id
      and ur.role::text = _role
  );
$$;

grant execute on function public.has_tenant_role(uuid, text) to authenticated;

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  target_url text not null,
  secret text not null,
  event_types text[] not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhooks_target_url_https check (target_url ~ '^https://'),
  constraint webhooks_event_types_nonempty check (cardinality(event_types) > 0)
);

create table if not exists public.webhook_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  audit_log_id uuid references public.audit_log(id) on delete set null,
  event_type text not null,
  attempt integer not null default 1,
  status_code integer,
  success boolean not null default false,
  error_message text,
  attempted_at timestamptz not null default now(),
  next_retry_at timestamptz
);

alter table public.webhooks enable row level security;
alter table public.webhook_delivery_attempts enable row level security;

grant select, insert, update, delete on public.webhooks to authenticated;
grant select on public.webhook_delivery_attempts to authenticated;

drop policy if exists webhooks_admin_select on public.webhooks;
drop policy if exists webhooks_admin_insert on public.webhooks;
drop policy if exists webhooks_admin_update on public.webhooks;
drop policy if exists webhooks_admin_delete on public.webhooks;
drop policy if exists webhook_attempts_admin_select on public.webhook_delivery_attempts;

create policy webhooks_admin_select on public.webhooks
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_tenant_role(tenant_id, 'admin'));
create policy webhooks_admin_insert on public.webhooks
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_tenant_role(tenant_id, 'admin'));
create policy webhooks_admin_update on public.webhooks
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_tenant_role(tenant_id, 'admin'))
  with check (tenant_id = public.current_tenant_id() and public.has_tenant_role(tenant_id, 'admin'));
create policy webhooks_admin_delete on public.webhooks
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_tenant_role(tenant_id, 'admin'));

create policy webhook_attempts_admin_select on public.webhook_delivery_attempts
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_tenant_role(tenant_id, 'admin'));

create index if not exists webhooks_tenant_enabled_idx on public.webhooks(tenant_id, enabled);
create index if not exists webhook_attempts_webhook_time_idx on public.webhook_delivery_attempts(webhook_id, attempted_at desc);

comment on column public.webhooks.secret is 'Server-only HMAC secret. Authenticated clients never receive this column; outbound dispatch uses it only in the trusted Edge Function.';
