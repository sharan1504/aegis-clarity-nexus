ALTER TABLE public.change_records
  ADD COLUMN IF NOT EXISTS estimated_cost_amount numeric,
  ADD COLUMN IF NOT EXISTS estimated_cost_currency text,
  ADD COLUMN IF NOT EXISTS estimated_savings_amount numeric,
  ADD COLUMN IF NOT EXISTS estimated_downtime_minutes integer;

ALTER TABLE public.change_records
  ADD CONSTRAINT change_records_estimated_cost_nonnegative
  CHECK (estimated_cost_amount IS NULL OR estimated_cost_amount >= 0),
  ADD CONSTRAINT change_records_estimated_savings_nonnegative
  CHECK (estimated_savings_amount IS NULL OR estimated_savings_amount >= 0),
  ADD CONSTRAINT change_records_estimated_downtime_nonnegative
  CHECK (estimated_downtime_minutes IS NULL OR estimated_downtime_minutes >= 0);

COMMENT ON COLUMN public.change_records.estimated_cost_amount IS 'Provider-derived estimated cost only; NULL means not estimated.';
COMMENT ON COLUMN public.change_records.estimated_savings_amount IS 'Provider-derived estimated savings only; NULL means not estimated.';
COMMENT ON COLUMN public.change_records.estimated_downtime_minutes IS 'Provider-derived expected downtime duration only; NULL means not estimated.';
