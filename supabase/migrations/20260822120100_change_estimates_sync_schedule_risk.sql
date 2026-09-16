-- Aegis operational change estimates, sync scheduling, and transparent risk factors.
ALTER TABLE public.change_records
  ADD COLUMN IF NOT EXISTS estimated_cost_amount numeric,
  ADD COLUMN IF NOT EXISTS estimated_cost_currency text,
  ADD COLUMN IF NOT EXISTS estimated_savings_amount numeric,
  ADD COLUMN IF NOT EXISTS estimated_downtime_minutes integer,
  ADD CONSTRAINT change_records_estimated_cost_nonnegative CHECK (estimated_cost_amount IS NULL OR estimated_cost_amount >= 0),
  ADD CONSTRAINT change_records_estimated_savings_nonnegative CHECK (estimated_savings_amount IS NULL OR estimated_savings_amount >= 0),
  ADD CONSTRAINT change_records_estimated_downtime_nonnegative CHECK (estimated_downtime_minutes IS NULL OR estimated_downtime_minutes >= 0);

COMMENT ON COLUMN public.change_records.estimated_cost_amount IS 'Real provider-derived estimated cost. NULL means not estimated.';
COMMENT ON COLUMN public.change_records.estimated_savings_amount IS 'Real provider-derived estimated savings. NULL means not estimated.';
COMMENT ON COLUMN public.change_records.estimated_downtime_minutes IS 'Real/explicitly derived impact duration. NULL means not estimated.';

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS sync_interval_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS last_sync_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_succeeded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD CONSTRAINT integrations_sync_interval_positive CHECK (sync_interval_minutes BETWEEN 15 AND 10080);

CREATE INDEX IF NOT EXISTS integrations_due_sync_idx
  ON public.integrations (status, sync_interval_minutes, last_sync_attempted_at);

CREATE TABLE IF NOT EXISTS public.integration_sync_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL UNIQUE REFERENCES public.integrations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  interval_minutes integer NOT NULL DEFAULT 60,
  last_attempted_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_sync_schedules_interval_positive CHECK (interval_minutes BETWEEN 15 AND 10080)
);

CREATE INDEX IF NOT EXISTS integration_sync_schedules_due_idx
  ON public.integration_sync_schedules (enabled, last_attempted_at);

ALTER TABLE public.integration_sync_schedules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.integration_sync_schedules TO authenticated;
GRANT ALL ON public.integration_sync_schedules TO service_role;

CREATE POLICY integration_sync_schedules_select
  ON public.integration_sync_schedules FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));
CREATE POLICY integration_sync_schedules_update
  ON public.integration_sync_schedules FOR UPDATE TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')))
  WITH CHECK (app_private.is_tenant_member(tenant_id));
CREATE POLICY integration_sync_schedules_insert
  ON public.integration_sync_schedules FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')));

CREATE TRIGGER integration_sync_schedules_updated_at BEFORE UPDATE ON public.integration_sync_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.integration_sync_schedules (tenant_id, integration_id, interval_minutes)
SELECT tenant_id, id, COALESCE(sync_interval_minutes,60)
FROM public.integrations
WHERE is_mock = false
ON CONFLICT (integration_id) DO NOTHING;
