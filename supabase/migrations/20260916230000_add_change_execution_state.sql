-- Persist governed provider execution state on the change record itself.
-- The payload is server-written and is never treated as authorization; approval
-- remains a separate, required boundary.
ALTER TABLE public.change_records
  ADD COLUMN IF NOT EXISTS execution jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.change_records.execution IS
  'Server-maintained governed execution state and approved provider action metadata. Never an authorization source.';
