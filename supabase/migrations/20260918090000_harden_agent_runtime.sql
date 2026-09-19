-- Enterprise agent runtime hardening: durable budgets, checkpoints, immutable traces and
-- concurrency-safe event allocation. LLM output never grants execution permission.

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS runtime_version text NOT NULL DEFAULT 'v2',
  ADD COLUMN IF NOT EXISTS trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS max_steps integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS max_tool_calls integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_wall_time_seconds integer NOT NULL DEFAULT 900,
  ADD COLUMN IF NOT EXISTS max_input_tokens integer NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS max_output_tokens integer NOT NULL DEFAULT 20000,
  ADD COLUMN IF NOT EXISTS max_cost_usd numeric(12,4) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS step_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tool_call_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkpoint jsonb,
  ADD COLUMN IF NOT EXISTS checkpointed_at timestamptz;

ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_budget_positive_check;
ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_budget_positive_check CHECK (
    max_steps > 0 AND max_tool_calls > 0 AND max_retries >= 0
    AND max_wall_time_seconds > 0 AND max_input_tokens > 0
    AND max_output_tokens > 0 AND max_cost_usd >= 0
    AND step_count >= 0 AND tool_call_count >= 0 AND retry_count >= 0
    AND input_tokens >= 0 AND output_tokens >= 0 AND cost_usd >= 0
  );

CREATE INDEX IF NOT EXISTS agent_runs_trace_idx ON public.agent_runs (trace_id);
CREATE INDEX IF NOT EXISTS agent_runs_active_idx ON public.agent_runs (tenant_id, status, updated_at DESC);

ALTER TABLE public.agent_run_events
  ADD COLUMN IF NOT EXISTS trace_id uuid,
  ADD COLUMN IF NOT EXISTS parent_event_id uuid,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS redacted boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payload_hash text;

CREATE INDEX IF NOT EXISTS agent_run_events_trace_idx ON public.agent_run_events (trace_id, occurred_at ASC);
CREATE INDEX IF NOT EXISTS agent_run_events_parent_idx ON public.agent_run_events (parent_event_id);

CREATE OR REPLACE FUNCTION public.prevent_agent_run_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'agent_run_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS agent_run_events_immutable ON public.agent_run_events;
CREATE TRIGGER agent_run_events_immutable
BEFORE UPDATE OR DELETE ON public.agent_run_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_agent_run_event_mutation();

CREATE OR REPLACE FUNCTION public.append_agent_run_event(
  p_run_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_step text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_capability_key text DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_trace_id uuid DEFAULT NULL,
  p_parent_event_id uuid DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_attempt integer DEFAULT 1
)
RETURNS public.agent_run_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_sequence integer;
  v_row public.agent_run_events;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant access denied';
  END IF;

  IF p_actor_id IS NOT NULL AND p_actor_id <> auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'actor mismatch';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_run_id::text, 77123));

  SELECT COALESCE(MAX(sequence), 0) + 1
    INTO v_sequence
    FROM public.agent_run_events
    WHERE run_id = p_run_id AND tenant_id = p_tenant_id;

  INSERT INTO public.agent_run_events (
    run_id, tenant_id, sequence, event_type, step, actor_id, provider,
    capability_key, outcome, payload, trace_id, parent_event_id,
    duration_ms, attempt, redacted, payload_hash
  )
  VALUES (
    p_run_id, p_tenant_id, v_sequence, p_event_type, p_step, p_actor_id,
    p_provider, p_capability_key, p_outcome, COALESCE(p_payload, '{}'::jsonb),
    p_trace_id, p_parent_event_id, p_duration_ms, GREATEST(p_attempt, 1), true,
    encode(digest(COALESCE(p_payload, '{}'::jsonb)::text, 'sha256'), 'hex')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_agent_run_event(
  uuid, uuid, uuid, text, text, text, text, text, jsonb, uuid, uuid, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.append_agent_run_event IS
  'Concurrency-safe append-only event writer for governed agent traces.';

COMMENT ON COLUMN public.agent_runs.trace_id IS 'Stable trace identifier shared by all spans/events in this run.';
COMMENT ON COLUMN public.agent_runs.checkpoint IS 'Durable runtime checkpoint; never treated as authorization.';


CREATE OR REPLACE FUNCTION public.claim_agent_budget(
  p_run_id uuid,
  p_tenant_id uuid,
  p_kind text,
  p_input_tokens integer DEFAULT 0,
  p_output_tokens integer DEFAULT 0,
  p_cost_usd numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  r public.agent_runs;
  next_steps integer;
  next_tools integer;
  next_retries integer;
  next_input integer;
  next_output integer;
  next_cost numeric;
  allowed boolean := true;
  reason text := null;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'tenant access denied');
  END IF;

  SELECT * INTO r
  FROM public.agent_runs
  WHERE id = p_run_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'agent run not found');
  END IF;

  IF r.cancel_requested THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'agent run cancellation was requested');
  END IF;

  IF r.deadline_at IS NOT NULL AND now() > r.deadline_at THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'agent run wall-time budget was exceeded');
  END IF;

  next_steps := r.step_count + CASE WHEN p_kind = 'step' THEN 1 ELSE 0 END;
  next_tools := r.tool_call_count + CASE WHEN p_kind = 'tool' THEN 1 ELSE 0 END;
  next_retries := r.retry_count + CASE WHEN p_kind = 'retry' THEN 1 ELSE 0 END;
  next_input := r.input_tokens + GREATEST(p_input_tokens, 0);
  next_output := r.output_tokens + GREATEST(p_output_tokens, 0);
  next_cost := r.cost_usd + GREATEST(p_cost_usd, 0);

  IF next_steps > r.max_steps THEN allowed := false; reason := 'maximum agent step budget exceeded'; END IF;
  IF allowed AND next_tools > r.max_tool_calls THEN allowed := false; reason := 'maximum tool-call budget exceeded'; END IF;
  IF allowed AND next_retries > r.max_retries THEN allowed := false; reason := 'maximum retry budget exceeded'; END IF;
  IF allowed AND next_input > r.max_input_tokens THEN allowed := false; reason := 'maximum input-token budget exceeded'; END IF;
  IF allowed AND next_output > r.max_output_tokens THEN allowed := false; reason := 'maximum output-token budget exceeded'; END IF;
  IF allowed AND next_cost > r.max_cost_usd THEN allowed := false; reason := 'maximum AI cost budget exceeded'; END IF;

  IF NOT allowed THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', reason, 'stepCount', r.step_count,
      'toolCallCount', r.tool_call_count, 'retryCount', r.retry_count,
      'inputTokens', r.input_tokens, 'outputTokens', r.output_tokens, 'costUsd', r.cost_usd
    );
  END IF;

  UPDATE public.agent_runs
  SET step_count = next_steps, tool_call_count = next_tools, retry_count = next_retries,
      input_tokens = next_input, output_tokens = next_output, cost_usd = next_cost,
      updated_at = now()
  WHERE id = r.id AND tenant_id = r.tenant_id;

  RETURN jsonb_build_object(
    'allowed', true, 'stepCount', next_steps, 'toolCallCount', next_tools,
    'retryCount', next_retries, 'inputTokens', next_input, 'outputTokens', next_output,
    'costUsd', next_cost
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_agent_budget(uuid, uuid, text, integer, integer, numeric)
  TO authenticated, service_role;
