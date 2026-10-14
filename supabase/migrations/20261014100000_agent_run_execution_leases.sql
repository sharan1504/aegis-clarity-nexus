-- Prevent concurrent workers from orchestrating the same agent run.
-- A lease is recoverable after process death; the token prevents an old worker
-- from releasing a lease that has since been claimed by another worker.

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS execution_lease_token uuid,
  ADD COLUMN IF NOT EXISTS execution_lease_until timestamptz;

CREATE INDEX IF NOT EXISTS agent_runs_execution_lease_idx
  ON public.agent_runs (execution_lease_until)
  WHERE execution_lease_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_agent_run_execution(
  p_run_id uuid,
  p_tenant_id uuid,
  p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_run public.agent_runs;
  v_token uuid;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant access denied';
  END IF;

  SELECT * INTO v_run
  FROM public.agent_runs
  WHERE id = p_run_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('acquired', false, 'status', 'not_found');
  END IF;

  IF v_run.status IN ('completed', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('acquired', false, 'status', v_run.status);
  END IF;

  IF v_run.cancel_requested THEN
    RETURN jsonb_build_object('acquired', false, 'status', 'cancelled');
  END IF;

  IF v_run.execution_lease_token IS NOT NULL
     AND v_run.execution_lease_until > now() THEN
    RETURN jsonb_build_object('acquired', false, 'status', v_run.status);
  END IF;

  v_token := gen_random_uuid();
  UPDATE public.agent_runs
  SET execution_lease_token = v_token,
      execution_lease_until = now() + make_interval(secs => GREATEST(15, LEAST(COALESCE(p_lease_seconds, 120), 300))),
      started_at = COALESCE(started_at, now()),
      updated_at = now()
  WHERE id = p_run_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('acquired', true, 'leaseToken', v_token, 'status', v_run.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_agent_run_execution(
  p_run_id uuid,
  p_tenant_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_released boolean;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant access denied';
  END IF;

  UPDATE public.agent_runs
  SET execution_lease_token = NULL,
      execution_lease_until = NULL,
      updated_at = now()
  WHERE id = p_run_id
    AND tenant_id = p_tenant_id
    AND execution_lease_token = p_lease_token;

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_agent_run_execution(uuid, uuid, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_agent_run_execution(uuid, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON COLUMN public.agent_runs.execution_lease_token IS
  'Fencing token for the worker currently orchestrating this run; null when unclaimed.';
COMMENT ON COLUMN public.agent_runs.execution_lease_until IS
  'Lease expiry allows recovery after a worker exits without releasing its claim.';
