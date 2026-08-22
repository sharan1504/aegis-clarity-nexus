-- Repair drift: create objects the repository migrations declare but the live database lacks.

-- 1. Webhook signing/dispatch pipeline (tables already exist; ensure helper objects + grants).
create table if not exists public.webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  audit_log_id uuid not null references public.audit_log(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','delivered','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.webhook_outbox to authenticated;
grant all on public.webhook_outbox to service_role;
alter table public.webhook_outbox enable row level security;
drop policy if exists webhook_outbox_admin_select on public.webhook_outbox;
create policy webhook_outbox_admin_select on public.webhook_outbox
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_tenant_role(tenant_id, 'admin'));
create index if not exists webhook_outbox_due_idx on public.webhook_outbox(status, next_attempt_at);

grant select, insert, update, delete on public.webhooks to authenticated;
grant all on public.webhooks to service_role;
revoke select(secret) on public.webhooks from authenticated;
grant select on public.webhook_delivery_attempts to authenticated;
grant all on public.webhook_delivery_attempts to service_role;
revoke all on public.webhooks from anon;
revoke all on public.webhook_delivery_attempts from anon;
revoke all on public.webhook_outbox from anon;

create or replace function public.enqueue_audit_webhooks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.webhook_outbox (tenant_id, webhook_id, audit_log_id, event_type, payload)
  select w.tenant_id, w.id, new.id, new.action,
         jsonb_build_object(
           'id', new.id, 'event', new.action, 'tenantId', new.tenant_id,
           'entityType', new.entity_type, 'entityId', new.entity_id,
           'detail', new.detail, 'payload', new.payload,
           'actorEmail', new.actor_email, 'actorRole', new.actor_role,
           'createdAt', new.created_at
         )
  from public.webhooks w
  where w.tenant_id = new.tenant_id and w.enabled and new.action = any(w.event_types);
  return new;
end;
$$;

drop trigger if exists audit_log_webhook_enqueue on public.audit_log;
create trigger audit_log_webhook_enqueue
after insert on public.audit_log
for each row execute function public.enqueue_audit_webhooks();

-- 2. Platform audit event stream.
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

grant select, insert on public.audit_events to authenticated;
grant all on public.audit_events to service_role;
alter table public.audit_events enable row level security;
drop policy if exists "tenant members can read audit events" on public.audit_events;
create policy "tenant members can read audit events" on public.audit_events
  for select to authenticated using (app_private.is_tenant_member(tenant_id));
drop policy if exists "tenant members can insert audit events" on public.audit_events;
create policy "tenant members can insert audit events" on public.audit_events
  for insert to authenticated with check (app_private.is_tenant_member(tenant_id));
create index if not exists audit_events_tenant_timestamp_idx on public.audit_events(tenant_id, timestamp desc);
create index if not exists audit_events_tenant_action_idx on public.audit_events(tenant_id, action);
create index if not exists audit_events_tenant_actor_idx on public.audit_events(tenant_id, actor_id);
create index if not exists audit_events_tenant_correlation_idx on public.audit_events(tenant_id, correlation_id);

-- 3. Provider connection vault + RPC.
create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
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
revoke all on public.provider_connections from anon;
grant select on public.provider_connections to authenticated;
grant all on public.provider_connections to service_role;
revoke select(encrypted_credentials) on public.provider_connections from authenticated;

create or replace function public.upsert_provider_connection(
  p_tenant_id uuid, p_provider text, p_external_id text, p_display_name text,
  p_status text, p_encrypted_credentials text, p_credential_expires_at timestamptz, p_last_error text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.tenant_id = p_tenant_id and ur.role in ('admin','manager')
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.provider_connections (
    tenant_id, provider, external_id, display_name, status,
    encrypted_credentials, credential_expires_at, last_error, created_by, connected_at, updated_at
  ) values (
    p_tenant_id, p_provider, p_external_id, p_display_name, p_status,
    p_encrypted_credentials, p_credential_expires_at, p_last_error, auth.uid(),
    case when p_status = 'connected' then now() else null end, now()
  )
  on conflict (tenant_id, provider) do update set
    external_id = excluded.external_id,
    display_name = excluded.display_name,
    status = excluded.status,
    encrypted_credentials = excluded.encrypted_credentials,
    credential_expires_at = excluded.credential_expires_at,
    last_error = excluded.last_error,
    connected_at = case when excluded.status = 'connected' then now() else provider_connections.connected_at end,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_provider_connection(uuid,text,text,text,text,text,timestamptz,text) from public;
grant execute on function public.upsert_provider_connection(uuid,text,text,text,text,text,timestamptz,text) to authenticated;

-- 4. Provider sync bookkeeping.
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

grant select on public.provider_sync_entities to authenticated;
grant all on public.provider_sync_entities to service_role;
alter table public.provider_sync_entities enable row level security;
drop policy if exists provider_sync_entities_tenant_select on public.provider_sync_entities;
create policy provider_sync_entities_tenant_select on public.provider_sync_entities
  for select to authenticated using (tenant_id = public.current_tenant_id());
create index if not exists provider_sync_entities_lookup_idx on public.provider_sync_entities(tenant_id, provider, entity_type, stale);

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

grant select on public.provider_sync_runs to authenticated;
grant all on public.provider_sync_runs to service_role;
alter table public.provider_sync_runs enable row level security;
drop policy if exists provider_sync_runs_tenant_select on public.provider_sync_runs;
create policy provider_sync_runs_tenant_select on public.provider_sync_runs
  for select to authenticated using (tenant_id = public.current_tenant_id());
create index if not exists provider_sync_runs_lookup_idx on public.provider_sync_runs(tenant_id, provider, started_at desc);

-- 5. Guardrail evaluation -> audit log trigger.
create or replace function public.audit_guardrail_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.decision <> 'allow' then
    insert into public.audit_log (tenant_id, action, entity_type, entity_id, detail, payload)
    values (
      new.tenant_id, 'guardrail.triggered', 'guardrail', new.change_record_id,
      'Guardrail decision: ' || new.decision,
      jsonb_build_object(
        'decision', new.decision, 'actionKey', new.action_key, 'provider', new.provider,
        'capability', new.capability, 'executionClass', new.execution_class,
        'reasons', new.reasons, 'requiredActions', new.required_actions
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists guardrail_evaluation_audit_trigger on public.guardrail_evaluations;
create trigger guardrail_evaluation_audit_trigger
after insert on public.guardrail_evaluations
for each row execute function public.audit_guardrail_trigger();