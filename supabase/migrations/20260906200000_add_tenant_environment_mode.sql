-- Workspace environment mode is tenant-scoped and defaults to LIVE.
-- Existing and newly-created tenants must never silently enter demo mode.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS environment_mode text NOT NULL DEFAULT 'live';

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_environment_mode_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_environment_mode_check
  CHECK (environment_mode IN ('live', 'demo'));

-- Defensive normalization for any legacy row created before this setting existed.
UPDATE public.tenants
SET environment_mode = 'live'
WHERE environment_mode IS NULL OR environment_mode NOT IN ('live', 'demo');

-- Existing tenants SELECT/UPDATE policies already enforce tenant membership and
-- admin-only writes. No new permissive policy is introduced for this column.
