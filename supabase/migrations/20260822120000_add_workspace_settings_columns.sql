-- Workspace settings are persisted on the tenant record.
-- The application already has tenant-scoped RLS policies; adding these columns
-- does not change the authorization boundary.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS primary_domain text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS analytics_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.tenants
SET timezone = 'UTC'
WHERE timezone IS NULL OR btrim(timezone) = '';

ALTER TABLE public.tenants
  ALTER COLUMN timezone SET DEFAULT 'UTC';
