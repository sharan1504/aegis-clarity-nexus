-- Aegis: allow multiple integration instances per tenant/provider.
-- Existing rows are preserved; the old provider singleton constraint is removed.
alter table public.provider_connections
  add column if not exists environment text not null default 'Production',
  add column if not exists notes text;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.provider_connections'::regclass
      and conname = 'provider_connections_tenant_id_provider_key'
  ) then
    alter table public.provider_connections drop constraint provider_connections_tenant_id_provider_key;
  end if;
end $$;

create index if not exists provider_connections_tenant_provider_idx
  on public.provider_connections (tenant_id, provider, status);

create index if not exists provider_connections_tenant_environment_idx
  on public.provider_connections (tenant_id, environment);

-- Replace the singleton upsert with an instance-aware create/update RPC.
drop function if exists public.upsert_provider_connection(uuid,text,text,text,text,text,timestamptz,text);

drop function if exists public.upsert_provider_connection(uuid,uuid,text,text,text,text,text,text,timestamptz,text);

create or replace function public.upsert_provider_connection(
  p_tenant_id uuid,
  p_connection_id uuid default null,
  p_provider text default null,
  p_external_id text default null,
  p_display_name text default null,
  p_environment text default 'Production',
  p_status text default 'failed',
  p_encrypted_credentials text default null,
  p_credential_expires_at timestamptz default null,
  p_last_error text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.tenant_id = p_tenant_id
      and ur.role in ('admin','manager')
  ) then
    raise exception 'not authorized';
  end if;

  if p_connection_id is null then
    insert into public.provider_connections (
      tenant_id, provider, external_id, display_name, environment, status,
      encrypted_credentials, credential_expires_at, last_error,
      created_by, connected_at, updated_at
    ) values (
      p_tenant_id, p_provider, p_external_id, p_display_name, coalesce(nullif(p_environment,''),'Production'), p_status,
      p_encrypted_credentials, p_credential_expires_at, p_last_error,
      auth.uid(), case when p_status = 'connected' then now() else null end, now()
    ) returning id into v_id;
  else
    update public.provider_connections
       set provider = p_provider,
           external_id = p_external_id,
           display_name = p_display_name,
           environment = coalesce(nullif(p_environment,''),'Production'),
           status = p_status,
           encrypted_credentials = coalesce(p_encrypted_credentials, encrypted_credentials),
           credential_expires_at = p_credential_expires_at,
           last_error = p_last_error,
           connected_at = case when p_status = 'connected' then coalesce(connected_at, now()) else connected_at end,
           updated_at = now()
     where id = p_connection_id and tenant_id = p_tenant_id
     returning id into v_id;

    if v_id is null then
      raise exception 'integration instance not found';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_provider_connection(uuid,uuid,text,text,text,text,text,text,timestamptz,text) from public;
grant execute on function public.upsert_provider_connection(uuid,uuid,text,text,text,text,text,text,timestamptz,text) to authenticated;
