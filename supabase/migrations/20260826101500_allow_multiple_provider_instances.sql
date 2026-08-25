-- The provider-agnostic integrations table was still singleton-scoped by
-- (tenant_id, provider), which made the Genesys instance-aware OAuth flow
-- impossible to use for more than one organization.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_tenant_id_provider_key'
  ) then
    alter table public.integrations drop constraint integrations_tenant_id_provider_key;
  end if;
end $$;

create index if not exists integrations_tenant_provider_status_idx
  on public.integrations (tenant_id, provider, status);

create index if not exists integrations_tenant_provider_updated_idx
  on public.integrations (tenant_id, provider, updated_at desc);
