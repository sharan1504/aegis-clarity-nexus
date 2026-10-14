-- Durable idempotency ledger for approved agent provider mutations.
CREATE TABLE IF NOT EXISTS public.agent_mutation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  change_record_id uuid NOT NULL REFERENCES public.change_records(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('claimed','retryable','succeeded','unknown')),
  lease_token uuid,
  lease_until timestamptz,
  receipt jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_id, change_record_id),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS agent_mutation_receipts_status_idx
  ON public.agent_mutation_receipts (status, lease_until);
ALTER TABLE public.agent_mutation_receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.agent_mutation_receipts TO authenticated;
GRANT ALL ON public.agent_mutation_receipts TO service_role;
CREATE POLICY agent_mutation_receipts_select ON public.agent_mutation_receipts
  FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.claim_agent_mutation(
  p_tenant_id uuid,
  p_run_id uuid,
  p_change_record_id uuid,
  p_lease_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  r public.agent_mutation_receipts;
  v_token uuid;
  v_key text;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) THEN RAISE EXCEPTION 'tenant access denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_run_id::text || ':' || p_change_record_id::text, 88421));
  v_key := 'agent-mutation:' || p_tenant_id::text || ':' || p_run_id::text || ':' || p_change_record_id::text;
  SELECT * INTO r FROM public.agent_mutation_receipts
    WHERE tenant_id = p_tenant_id AND run_id = p_run_id AND change_record_id = p_change_record_id
    FOR UPDATE;
  IF FOUND THEN
    IF r.status = 'succeeded' THEN
      RETURN jsonb_build_object('status', 'succeeded', 'acquired', false, 'receipt', r.receipt);
    END IF;
    IF r.status = 'unknown' THEN
      RETURN jsonb_build_object('status', 'unknown', 'acquired', false, 'reason', 'Previous provider attempt has an uncertain outcome; reconcile before retrying.');
    END IF;
    IF r.status = 'claimed' AND r.lease_until > now() THEN
      RETURN jsonb_build_object('status', 'in_progress', 'acquired', false, 'reason', 'Provider mutation is already in progress.');
    END IF;
    IF r.status = 'claimed' AND (r.lease_until IS NULL OR r.lease_until <= now()) THEN
      UPDATE public.agent_mutation_receipts SET status = 'unknown', lease_token = NULL, lease_until = NULL,
        last_error = 'Mutation lease expired before a durable receipt was recorded.', updated_at = now()
      WHERE id = r.id;
      RETURN jsonb_build_object('status', 'unknown', 'acquired', false, 'reason', 'Previous provider attempt may have succeeded; reconcile before retrying.');
    END IF;
  END IF;
  v_token := gen_random_uuid();
  IF r.id IS NULL THEN
    INSERT INTO public.agent_mutation_receipts(tenant_id, run_id, change_record_id, idempotency_key, status, lease_token, lease_until)
    VALUES (p_tenant_id, p_run_id, p_change_record_id, v_key, 'claimed', v_token,
      now() + make_interval(secs => GREATEST(30, LEAST(COALESCE(p_lease_seconds, 300), 900))));
  ELSE
    UPDATE public.agent_mutation_receipts SET status = 'claimed', lease_token = v_token,
      lease_until = now() + make_interval(secs => GREATEST(30, LEAST(COALESCE(p_lease_seconds, 300), 900))),
      last_error = NULL, updated_at = now() WHERE id = r.id;
  END IF;
  RETURN jsonb_build_object('status', 'claimed', 'acquired', true, 'leaseToken', v_token, 'idempotencyKey', v_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_agent_mutation(
  p_tenant_id uuid, p_run_id uuid, p_change_record_id uuid, p_lease_token uuid, p_receipt jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private
AS $$
DECLARE v_rows integer;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) THEN RAISE EXCEPTION 'tenant access denied'; END IF;
  UPDATE public.agent_mutation_receipts SET status = 'succeeded', receipt = COALESCE(p_receipt, '{}'::jsonb),
    lease_token = NULL, lease_until = NULL, last_error = NULL, updated_at = now()
  WHERE tenant_id = p_tenant_id AND run_id = p_run_id AND change_record_id = p_change_record_id
    AND status = 'claimed' AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_agent_mutation_claim(
  p_tenant_id uuid, p_run_id uuid, p_change_record_id uuid, p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private
AS $$
DECLARE v_rows integer;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) THEN RAISE EXCEPTION 'tenant access denied'; END IF;
  UPDATE public.agent_mutation_receipts SET status = 'retryable', lease_token = NULL, lease_until = NULL, updated_at = now()
  WHERE tenant_id = p_tenant_id AND run_id = p_run_id AND change_record_id = p_change_record_id
    AND status = 'claimed' AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_agent_mutation_unknown(
  p_tenant_id uuid, p_run_id uuid, p_change_record_id uuid, p_lease_token uuid, p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private
AS $$
DECLARE v_rows integer;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) THEN RAISE EXCEPTION 'tenant access denied'; END IF;
  UPDATE public.agent_mutation_receipts SET status = 'unknown', lease_token = NULL, lease_until = NULL,
    last_error = left(COALESCE(p_error, 'Provider outcome is uncertain; manual reconciliation is required.'), 1000), updated_at = now()
  WHERE tenant_id = p_tenant_id AND run_id = p_run_id AND change_record_id = p_change_record_id
    AND status = 'claimed' AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_agent_mutation(uuid,uuid,uuid,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_agent_mutation(uuid,uuid,uuid,uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_agent_mutation_claim(uuid,uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_agent_mutation_unknown(uuid,uuid,uuid,uuid,text) TO authenticated, service_role;
