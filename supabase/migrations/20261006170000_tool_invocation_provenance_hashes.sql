-- Investigation tool provenance hashes and audit linkage.
ALTER TABLE public.tool_invocations
  ADD COLUMN IF NOT EXISTS input_hash text,
  ADD COLUMN IF NOT EXISTS output_hash text,
  ADD COLUMN IF NOT EXISTS prompt_hash text,
  ADD COLUMN IF NOT EXISTS evidence_hash text;

CREATE INDEX IF NOT EXISTS tool_invocations_input_hash_idx
  ON public.tool_invocations (tenant_id, input_hash);
CREATE INDEX IF NOT EXISTS tool_invocations_output_hash_idx
  ON public.tool_invocations (tenant_id, output_hash);
