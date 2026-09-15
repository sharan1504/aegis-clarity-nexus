-- Unify Genesys credentials with provider_connections.
-- Secrets are application-encrypted with AES-256-GCM before reaching this table.
-- The legacy integration_credentials table is intentionally retained for the
-- one-time application migration utility; application runtime must not read it.

alter table public.provider_connections
  add column if not exists integration_id uuid references public.integrations(id) on delete cascade;

create unique index if not exists provider_connections_integration_id_uq
  on public.provider_connections(integration_id)
  where integration_id is not null;

revoke all on public.integration_credentials from anon, authenticated;
revoke select (encrypted_credentials) on public.provider_connections from anon, authenticated;

grant select (id, tenant_id, provider, external_id, display_name, status, environment,
  credential_expires_at, last_sync_at, last_error, created_by, connected_at, updated_at)
  on public.provider_connections to authenticated;

grant all on public.provider_connections to service_role;
grant all on public.integration_credentials to service_role;
