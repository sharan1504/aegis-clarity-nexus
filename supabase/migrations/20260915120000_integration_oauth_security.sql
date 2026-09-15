-- Phase 2/3 OAuth state and credential security.
-- OAuth state is server-only; PKCE verifier and connection reference never reach authenticated clients.
alter table public.integration_oauth_states
  add column if not exists connection_id uuid references public.provider_connections(id) on delete cascade,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

grant all on public.integration_oauth_states to service_role;
revoke all on public.integration_oauth_states from anon, authenticated;

-- The encrypted credential payload is service-role only. Authenticated tenant
-- members retain status/metadata visibility through the non-secret columns.
revoke select (encrypted_credentials) on public.provider_connections from authenticated;
revoke select (encrypted_credentials) on public.provider_connections from anon;
grant select (id, tenant_id, provider, external_id, display_name, status, environment, credential_expires_at, last_sync_at, last_error, created_by, connected_at, updated_at)
  on public.provider_connections to authenticated;
grant all on public.provider_connections to service_role;

-- Legacy plaintext vault is intentionally left in place until the one-time
-- application-layer migration job has successfully copied every row into
-- provider_connections. The follow-up migration drops it only after that
-- job is verified in production.
