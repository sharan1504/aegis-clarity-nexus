-- Real, tenant-scoped audit stream for Aegis platform activity.
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  correlation_id text not null,
  timestamp timestamptz not null default now(),
  actor_id uuid null references auth.users(id) on delete set null,
  actor_name text not null,
  actor_email text not null default '',
  actor_role text not null default 'System',
  actor_type text not null default 'system',
  action text not null,
  resource_type text not null,
  resource_name text not null,
  target_id text null,
  integration text null,
  agent text null,
  changes jsonb not null default '[]'::jsonb,
  reason text null,
  approval_id text null,
  approval_status text null,
  result text not null,
  risk text not null,
  source jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  seeded boolean not null default false
);

create index if not exists audit_events_tenant_timestamp_idx on public.audit_events(tenant_id, timestamp desc);
create index if not exists audit_events_tenant_action_idx on public.audit_events(tenant_id, action);
create index if not exists audit_events_tenant_actor_idx on public.audit_events(tenant_id, actor_id);
create index if not exists audit_events_tenant_correlation_idx on public.audit_events(tenant_id, correlation_id);

alter table public.audit_events enable row level security;

create policy "tenant members can read audit events"
on public.audit_events for select
using (public.is_tenant_member(tenant_id));

create policy "tenant members can insert audit events"
on public.audit_events for insert
with check (public.is_tenant_member(tenant_id));
