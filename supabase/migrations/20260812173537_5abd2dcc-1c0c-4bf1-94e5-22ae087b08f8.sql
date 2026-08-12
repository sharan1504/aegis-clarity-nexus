ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS purged_at timestamp with time zone;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS report_retention_days integer NOT NULL DEFAULT 30;

CREATE INDEX IF NOT EXISTS reports_expiry_idx ON public.reports (tenant_id, expires_at) WHERE purged_at IS NULL;