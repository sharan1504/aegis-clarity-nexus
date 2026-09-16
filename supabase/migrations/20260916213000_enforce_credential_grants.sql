-- Enforce least-privilege access for provider credentials.
-- Secret-bearing provider data is server-only; authenticated users may only
-- read the tenant-scoped non-secret connection metadata.

REVOKE ALL ON public.integration_credentials FROM anon, authenticated;
GRANT ALL ON public.integration_credentials TO service_role;

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
  updated_at
) ON public.provider_connections TO authenticated;
GRANT ALL ON public.provider_connections TO service_role;

-- Keep RLS as the tenant boundary for the metadata that authenticated users
-- can read; the encrypted credential payload is never selectable by them.
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;
