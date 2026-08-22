-- The Settings UI persists organization, timezone and security preferences on the tenant.
-- These columns were missing from the original tenants table, which caused
-- PostgREST to return: column tenants.analytics_settings does not exist.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS primary_domain text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS analytics_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.tenants
SET timezone = 'UTC'
WHERE timezone IS NULL OR btrim(timezone) = '';
