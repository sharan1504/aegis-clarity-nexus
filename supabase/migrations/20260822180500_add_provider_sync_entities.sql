create table if not exists public.provider_sync_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  entity_type text not null,
  entity_key text not null,
  payload jsonb not null,
  observed_at timestamptz not null default now(),
  sync_run_id uuid,
  stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, provider, entity_type, entity_key)
);

alter table public.provider_sync_entities enable row level security;
create policy provider_sync_entities_tenant_select on public.provider_sync_entities
  for select to authenticated using (tenant_id = public.current_tenant_id());
create index if not exists provider_sync_entities_lookup_idx on public.provider_sync_entities(tenant_id, provider, entity_type, stale);
