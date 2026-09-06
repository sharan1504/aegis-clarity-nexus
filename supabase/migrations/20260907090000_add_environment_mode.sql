-- Workspace environment mode: live is the safe default; demo is explicit and tenant-scoped.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'environment_mode') THEN
    CREATE TYPE public.environment_mode AS ENUM ('live', 'demo');
  END IF;
END $$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS environment_mode public.environment_mode NOT NULL DEFAULT 'live';

UPDATE public.tenants
SET environment_mode = 'live'
WHERE environment_mode IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN environment_mode SET DEFAULT 'live',
  ALTER COLUMN environment_mode SET NOT NULL;

COMMENT ON COLUMN public.tenants.environment_mode IS
  'Workspace-wide data environment. Live uses connected tenant data only; Demo enables deterministic demo fixtures.';
