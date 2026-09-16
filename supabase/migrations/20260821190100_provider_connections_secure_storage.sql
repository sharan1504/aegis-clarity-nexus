create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null,
  external_id text,
  display_name text,
  status text not null default 'failed' check (status in ('connected','failed','disconnected')),
  encrypted_credentials text,
  credential_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_by uuid,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

alter table public.provider_connections enable row level security;

drop policy if exists provider_connections_select_member on public.provider_connections;
create policy provider_connections_select_member on public.provider_connections
for select to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.tenant_id = provider_connections.tenant_id));

drop policy if exists provider_connections_write_admin on public.provider_connections;
create policy provider_connections_write_admin on public.provider_connections
for all to authenticated
using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.tenant_id = provider_connections.tenant_id and ur.role in ('admin','manager')))
with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.tenant_id = provider_connections.tenant_id and ur.role in ('admin','manager')));

revoke all on public.provider_connections from anon;
revoke insert, update, delete on public.provider_connections from authenticated;
grant select on public.provider_connections to authenticated;
