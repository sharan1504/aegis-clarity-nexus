-- Guardrail evaluations already retain reasons/matched arrays. Add an optional
-- structured score breakdown so the same transparency contract can be used by
-- guardrail UI without inventing client-side explanations.
ALTER TABLE public.guardrail_evaluations
  ADD COLUMN IF NOT EXISTS risk_score integer,
  ADD COLUMN IF NOT EXISTS risk_tier text,
  ADD COLUMN IF NOT EXISTS risk_factors jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.guardrail_evaluations
  ADD CONSTRAINT guardrail_evaluations_risk_score_range CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100),
  ADD CONSTRAINT guardrail_evaluations_risk_factors_array CHECK (jsonb_typeof(risk_factors) = 'array');
