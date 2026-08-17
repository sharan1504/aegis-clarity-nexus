-- Guardrail history must outlive the rule it describes: the cascade delete
-- collided with the immutability trigger, so deleting a guardrail always failed.
ALTER TABLE public.guardrail_revisions
  DROP CONSTRAINT IF EXISTS guardrail_revisions_guardrail_id_fkey;