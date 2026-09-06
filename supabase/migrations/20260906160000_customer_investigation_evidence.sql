create table if not exists public.customer_investigations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id text,
  conversation_id text,
  interaction_id text,
  channel text not null default 'unknown',
  subject text,
  status text not null default 'running' check (status in ('running','resolved','failed','needs_human')),
  intent text,
  resolution text,
  confidence numeric(5,2),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists customer_investigations_tenant_created_idx on public.customer_investigations (tenant_id, created_at desc);
create index if not exists customer_investigations_tenant_conversation_idx on public.customer_investigations (tenant_id, conversation_id);

create table if not exists public.investigation_steps (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  investigation_id uuid not null references public.customer_investigations(id) on delete cascade, step_number integer not null,
  step_type text not null check (step_type in ('intent','tool_call','evidence','finding','decision','action','verification','response')),
  name text not null, status text not null default 'completed' check (status in ('running','completed','failed','skipped')),
  provider text, tool_name text, tool_server text, input jsonb, output jsonb, evidence jsonb, finding text,
  started_at timestamptz not null default now(), completed_at timestamptz, latency_ms integer, error_message text,
  metadata jsonb not null default '{}'::jsonb, unique (investigation_id, step_number)
);
create index if not exists investigation_steps_tenant_investigation_idx on public.investigation_steps (tenant_id, investigation_id, step_number);
create index if not exists investigation_steps_tool_idx on public.investigation_steps (tenant_id, tool_name);

create table if not exists public.tool_invocations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  investigation_id uuid references public.customer_investigations(id) on delete set null, conversation_id text, interaction_id text,
  agent_run_id text, provider text, server_name text, tool_name text not null, arguments jsonb not null default '{}'::jsonb,
  result jsonb, status text not null default 'running' check (status in ('running','success','failed')),
  started_at timestamptz not null default now(), completed_at timestamptz, latency_ms integer, error_message text,
  authorization jsonb not null default '{}'::jsonb, metadata jsonb not null default '{}'::jsonb
);
create index if not exists tool_invocations_tenant_investigation_idx on public.tool_invocations (tenant_id, investigation_id, started_at desc);
create index if not exists tool_invocations_tenant_conversation_idx on public.tool_invocations (tenant_id, conversation_id, started_at desc);

create table if not exists public.customer_resolutions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  investigation_id uuid not null references public.customer_investigations(id) on delete cascade, channel text not null,
  response_text text not null, resolution_type text, evidence_summary jsonb not null default '[]'::jsonb,
  verified boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists customer_resolutions_tenant_investigation_idx on public.customer_resolutions (tenant_id, investigation_id, created_at desc);

alter table public.customer_investigations enable row level security; alter table public.customer_investigations force row level security;
alter table public.investigation_steps enable row level security; alter table public.investigation_steps force row level security;
alter table public.tool_invocations enable row level security; alter table public.tool_invocations force row level security;
alter table public.customer_resolutions enable row level security; alter table public.customer_resolutions force row level security;

create policy customer_investigations_select on public.customer_investigations for select to authenticated using (exists (select 1 from public.user_roles ur where ur.tenant_id = customer_investigations.tenant_id and ur.user_id = auth.uid()));
create policy investigation_steps_select on public.investigation_steps for select to authenticated using (exists (select 1 from public.user_roles ur where ur.tenant_id = investigation_steps.tenant_id and ur.user_id = auth.uid()));
create policy tool_invocations_select on public.tool_invocations for select to authenticated using (exists (select 1 from public.user_roles ur where ur.tenant_id = tool_invocations.tenant_id and ur.user_id = auth.uid()));
create policy customer_resolutions_select on public.customer_resolutions for select to authenticated using (exists (select 1 from public.user_roles ur where ur.tenant_id = customer_resolutions.tenant_id and ur.user_id = auth.uid()));
create policy customer_investigations_service_role on public.customer_investigations for all to service_role using (true) with check (true);
create policy investigation_steps_service_role on public.investigation_steps for all to service_role using (true) with check (true);
create policy tool_invocations_service_role on public.tool_invocations for all to service_role using (true) with check (true);
create policy customer_resolutions_service_role on public.customer_resolutions for all to service_role using (true) with check (true);
