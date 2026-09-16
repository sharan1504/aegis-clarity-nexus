-- Connector health/sync evidence is non-secret connection metadata.
REVOKE ALL ON public.provider_connections FROM anon, authenticated;
GRANT SELECT (
  id,
  tenant_id,
  provider,
  external_id,
  display_name,
  status,
  environment,
  credential_expires_at,
  last_sync_at,
  last_error,
  created_by,
  connected_at,
  updated_at,
  health_status,
  health_checked_at,
  health_error,
  last_sync_status,
  last_sync_attempted_at,
  last_sync_successful_at,
  sync_record_count,
  sync_error
) ON public.provider_connections TO authenticated;
GRANT ALL ON public.provider_connections TO service_role;
