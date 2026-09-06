create table if not exists public.github_synced_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.provider_connections(id) on delete cascade,
  entity_type text not null check (entity_type in ('repository','workflow_run','security_alert')),
  entity_key text not null,
  repository_name text,
  workflow_status text,
  workflow_conclusion text,
  alert_severity text,
  alert_title text,
  alert_state text,
  html_url text,
  provider_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  stale boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  unique (tenant_id, connection_id, entity_type, entity_key)
);
create index if not exists github_synced_entities_tenant_type_idx on public.github_synced_entities(tenant_id, entity_type, stale);
create index if not exists github_synced_entities_connection_idx on public.github_synced_entities(tenant_id, connection_id);
alter table public.github_synced_entities enable row level security;
alter table public.github_synced_entities force row level security;
create policy "github synced entities tenant members can read" on public.github_synced_entities for select to authenticated using (exists (select 1 from public.user_roles ur where ur.tenant_id = github_synced_entities.tenant_id and ur.user_id = auth.uid()));
create policy "github synced entities service role can manage" on public.github_synced_entities for all to service_role using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create table if not exists public.github_sync_status (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.provider_connections(id) on delete cascade,
  last_attempted_at timestamptz,
  last_successful_at timestamptz,
  status text not null default 'never',
  error_message text,
  repositories_count integer not null default 0,
  workflow_runs_count integer not null default 0,
  security_alerts_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, connection_id)
);
alter table public.github_sync_status enable row level security;
alter table public.github_sync_status force row level security;
create policy "github sync status tenant members can read" on public.github_sync_status for select to authenticated using (exists (select 1 from public.user_roles ur where ur.tenant_id = github_sync_status.tenant_id and ur.user_id = auth.uid()));
create policy "github sync status service role can manage" on public.github_sync_status for all to service_role using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
