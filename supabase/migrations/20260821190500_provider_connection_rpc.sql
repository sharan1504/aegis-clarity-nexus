create or replace function public.upsert_provider_connection(
  p_tenant_id uuid,
  p_provider text,
  p_external_id text,
  p_display_name text,
  p_status text,
  p_encrypted_credentials text,
  p_credential_expires_at timestamptz,
  p_last_error text
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

  insert into public.provider_connections (
    tenant_id, provider, external_id, display_name, status,
    encrypted_credentials, credential_expires_at, last_error,
    created_by, connected_at, updated_at
  ) values (
    p_tenant_id, p_provider, p_external_id, p_display_name, p_status,
    p_encrypted_credentials, p_credential_expires_at, p_last_error,
    auth.uid(), case when p_status = 'connected' then now() else null end, now()
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
