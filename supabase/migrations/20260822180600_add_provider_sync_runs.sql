create table if not exists public.provider_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  status text not null check (status in ('running','success','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_seen integer not null default 0,
  records_upserted integer not null default 0,
  records_staled integer not null default 0,
  error_message text
);

alter table public.provider_sync_runs enable row level security;
create policy provider_sync_runs_tenant_select on public.provider_sync_runs
  for select to authenticated using (tenant_id = public.current_tenant_id());
create index if not exists provider_sync_runs_lookup_idx on public.provider_sync_runs(tenant_id, provider, started_at desc);
