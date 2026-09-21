alter table public.ai_usage_events
  add column if not exists agent_run_id uuid references public.agent_runs(id) on delete set null,
  add column if not exists trace_id text;

create index if not exists idx_ai_usage_events_agent_run
  on public.ai_usage_events (tenant_id, agent_run_id, created_at desc)
  where agent_run_id is not null;

create index if not exists idx_ai_usage_events_trace
  on public.ai_usage_events (tenant_id, trace_id, created_at desc)
  where trace_id is not null;
