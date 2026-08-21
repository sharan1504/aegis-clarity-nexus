-- Preserve transparent risk inputs as structured, server-computed factors.
ALTER TABLE public.change_records
  ADD COLUMN IF NOT EXISTS risk_factors jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.change_records
  ADD CONSTRAINT change_records_risk_factors_array CHECK (jsonb_typeof(risk_factors) = 'array');

COMMENT ON COLUMN public.change_records.risk_factors IS 'Server-computed risk contributors. Each item may contain key, label, weight, contribution, and evidence. Never client-invented.';
