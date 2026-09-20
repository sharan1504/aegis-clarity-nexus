-- Governed external automation plane.
-- Aegis remains authoritative for tenant, policy, approval and audit state.
create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  provider text not null default 'n8n' check (provider in ('n8n')),
  trigger_type text not null default 'webhook' check (trigger_type in ('webhook','schedule','event','manual')),
  status text not null default 'active' check (status in ('active','disabled')),
  config_encrypted text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists automation_workflows_tenant_idx
  on public.automation_workflows (tenant_id, status);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  agent_run_id uuid null references public.agent_runs(id) on delete set null,
  trace_id text null,
  idempotency_key text not null,
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  external_execution_id text null,
  input jsonb not null default '{}'::jsonb,
  result jsonb null,
  error text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (workflow_id, idempotency_key)
);

create index if not exists automation_runs_tenant_status_idx
  on public.automation_runs (tenant_id, status, created_at desc);

create index if not exists automation_runs_trace_idx
  on public.automation_runs (trace_id)
  where trace_id is not null;

create table if not exists public.automation_run_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  automation_run_id uuid not null references public.automation_runs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists automation_run_events_run_idx
  on public.automation_run_events (automation_run_id, occurred_at);

alter table public.automation_workflows enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_run_events enable row level security;

drop policy if exists automation_workflows_tenant_access on public.automation_workflows;
create policy automation_workflows_tenant_access on public.automation_workflows
  for all using (tenant_id = public.current_user_tenant_id())
  with check (tenant_id = public.current_user_tenant_id());

drop policy if exists automation_runs_tenant_access on public.automation_runs;
create policy automation_runs_tenant_access on public.automation_runs
  for all using (tenant_id = public.current_user_tenant_id())
  with check (tenant_id = public.current_user_tenant_id());

drop policy if exists automation_run_events_tenant_access on public.automation_run_events;
create policy automation_run_events_tenant_access on public.automation_run_events
  for all using (tenant_id = public.current_user_tenant_id())
  with check (tenant_id = public.current_user_tenant_id());

create or replace function public.set_automation_workflow_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists automation_workflows_updated_at on public.automation_workflows;
create trigger automation_workflows_updated_at
before update on public.automation_workflows
for each row execute function public.set_automation_workflow_updated_at();
