-- Audit chain v2: serialized per-tenant append, full-field canonical hashes,
-- verification, and a durable outbox for independent external anchoring.
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS chain_sequence bigint,
  ADD COLUMN IF NOT EXISTS hash_version integer NOT NULL DEFAULT 1;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY created_at ASC, id ASC) AS seq
  FROM public.audit_log
)
UPDATE public.audit_log a SET chain_sequence = ordered.seq
FROM ordered WHERE ordered.id = a.id AND a.chain_sequence IS NULL;

ALTER TABLE public.audit_log ALTER COLUMN chain_sequence SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audit_log_tenant_sequence_uidx
  ON public.audit_log (tenant_id, chain_sequence);

CREATE TABLE IF NOT EXISTS public.audit_chain_anchor_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  chain_sequence bigint NOT NULL,
  head_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','anchored','failed')),
  external_reference text,
  anchor_response jsonb,
  last_error text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  anchored_at timestamptz,
  UNIQUE (tenant_id, chain_sequence)
);
CREATE INDEX IF NOT EXISTS audit_chain_anchor_pending_idx
  ON public.audit_chain_anchor_outbox (requested_at)
  WHERE status IN ('pending','failed');
ALTER TABLE public.audit_chain_anchor_outbox ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.audit_chain_anchor_outbox TO authenticated;
GRANT ALL ON public.audit_chain_anchor_outbox TO service_role;
CREATE POLICY audit_chain_anchor_select ON public.audit_chain_anchor_outbox
  FOR SELECT TO authenticated USING (app_private.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.audit_log_seal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  last_hash text;
  last_sequence bigint;
  canonical text;
BEGIN
  -- Serialize writers for a tenant so two transactions cannot fork the chain.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text, 77231));
  SELECT hash, chain_sequence INTO last_hash, last_sequence
  FROM public.audit_log
  WHERE tenant_id = NEW.tenant_id
  ORDER BY chain_sequence DESC
  LIMIT 1;

  NEW.created_at := clock_timestamp();
  NEW.chain_sequence := COALESCE(last_sequence, 0) + 1;
  NEW.prev_hash := last_hash;
  NEW.actor_id := COALESCE(auth.uid(), NEW.actor_id);
  NEW.hash_version := 2;
  canonical := jsonb_build_object(
    'version', 2,
    'sequence', NEW.chain_sequence,
    'tenant_id', NEW.tenant_id,
    'actor_id', NEW.actor_id,
    'actor_email', NEW.actor_email,
    'actor_role', NEW.actor_role,
    'action', NEW.action,
    'entity_type', NEW.entity_type,
    'entity_id', NEW.entity_id,
    'detail', NEW.detail,
    'payload', NEW.payload,
    'created_at', NEW.created_at
  )::text;
  NEW.hash := encode(digest(COALESCE(last_hash, 'genesis') || '|' || canonical, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_audit_chain_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.chain_sequence % 100 = 0 THEN
    INSERT INTO public.audit_chain_anchor_outbox(tenant_id, chain_sequence, head_hash)
    VALUES (NEW.tenant_id, NEW.chain_sequence, NEW.hash)
    ON CONFLICT (tenant_id, chain_sequence) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS audit_chain_anchor_enqueue ON public.audit_log;
CREATE TRIGGER audit_chain_anchor_enqueue AFTER INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_audit_chain_anchor();

CREATE OR REPLACE FUNCTION public.request_audit_chain_anchor(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE v_head public.audit_log;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'tenant access denied';
  END IF;
  SELECT * INTO v_head FROM public.audit_log
  WHERE tenant_id = p_tenant_id ORDER BY chain_sequence DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('queued', false, 'reason', 'empty_chain'); END IF;
  INSERT INTO public.audit_chain_anchor_outbox(tenant_id, chain_sequence, head_hash)
  VALUES (p_tenant_id, v_head.chain_sequence, v_head.hash)
  ON CONFLICT (tenant_id, chain_sequence) DO UPDATE
    SET status = CASE WHEN public.audit_chain_anchor_outbox.status = 'anchored' THEN 'anchored' ELSE 'pending' END,
        last_error = NULL
  RETURNING id INTO v_head.id;
  RETURN jsonb_build_object('queued', true, 'sequence', v_head.chain_sequence, 'headHash', v_head.hash);
END;
$$;
GRANT EXECUTE ON FUNCTION public.request_audit_chain_anchor(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  r public.audit_log;
  expected_prev text := NULL;
  expected_sequence bigint := 1;
  expected_hash text;
  canonical text;
  checked_count bigint := 0;
  bad_sequence bigint := NULL;
  head_hash text := NULL;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'tenant access denied';
  END IF;
  FOR r IN SELECT * FROM public.audit_log WHERE tenant_id = p_tenant_id ORDER BY chain_sequence ASC LOOP
    IF r.chain_sequence <> expected_sequence OR r.prev_hash IS DISTINCT FROM expected_prev THEN
      bad_sequence := r.chain_sequence; EXIT;
    END IF;
    IF r.hash_version = 1 THEN
      expected_hash := encode(digest(
        COALESCE(expected_prev, 'genesis') || '|' || r.tenant_id::text || '|' ||
        COALESCE(r.actor_id::text, 'system') || '|' || r.action || '|' ||
        r.entity_type || '|' || COALESCE(r.entity_id, '') || '|' ||
        r.payload::text || '|' || r.created_at::text, 'sha256'), 'hex');
    ELSIF r.hash_version = 2 THEN
      canonical := jsonb_build_object(
        'version', 2, 'sequence', r.chain_sequence, 'tenant_id', r.tenant_id,
        'actor_id', r.actor_id, 'actor_email', r.actor_email, 'actor_role', r.actor_role,
        'action', r.action, 'entity_type', r.entity_type, 'entity_id', r.entity_id,
        'detail', r.detail, 'payload', r.payload, 'created_at', r.created_at
      )::text;
      expected_hash := encode(digest(COALESCE(expected_prev, 'genesis') || '|' || canonical, 'sha256'), 'hex');
    ELSE
      bad_sequence := r.chain_sequence; EXIT;
    END IF;
    IF r.hash IS DISTINCT FROM expected_hash THEN bad_sequence := r.chain_sequence; EXIT; END IF;
    checked_count := checked_count + 1;
    expected_prev := r.hash;
    head_hash := r.hash;
    expected_sequence := expected_sequence + 1;
  END LOOP;
  RETURN jsonb_build_object(
    'valid', bad_sequence IS NULL, 'checkedEntries', checked_count,
    'firstInvalidSequence', bad_sequence, 'headSequence', checked_count, 'headHash', head_hash
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.audit_log.chain_sequence IS 'Monotonic per-tenant chain position assigned under an advisory transaction lock.';
COMMENT ON COLUMN public.audit_log.hash_version IS 'Hash canonicalization version; v1 rows are legacy, v2 includes all event fields.';
