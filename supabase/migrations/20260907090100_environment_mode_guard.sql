-- Defense-in-depth: environment_mode is tenant-scoped on public.tenants.
-- Existing tenant RLS policies remain the source of authorization; this migration
-- intentionally adds no new permissive policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tenants'::regclass
      AND conname = 'tenants_environment_mode_valid'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_environment_mode_valid
      CHECK (environment_mode IN ('live', 'demo'));
  END IF;
END $$;
