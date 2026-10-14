-- Fleet-wide provider sync admission control. Database locks coordinate all app instances.
CREATE TABLE IF NOT EXISTS public.provider_governor_windows (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, provider)
);
CREATE TABLE IF NOT EXISTS public.provider_sync_leases (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  connection_id uuid NOT NULL,
  run_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_sync_leases_active_idx
  ON public.provider_sync_leases (tenant_id, provider, expires_at);
ALTER TABLE public.provider_governor_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_sync_leases ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_governor_windows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_sync_leases TO authenticated;
GRANT ALL ON public.provider_governor_windows TO service_role;
GRANT ALL ON public.provider_sync_leases TO service_role;
CREATE POLICY provider_governor_windows_tenant_policy ON public.provider_governor_windows
  FOR ALL TO authenticated USING (app_private.is_tenant_member(tenant_id))
  WITH CHECK (app_private.is_tenant_member(tenant_id));
CREATE POLICY provider_sync_leases_tenant_policy ON public.provider_sync_leases
  FOR ALL TO authenticated USING (app_private.is_tenant_member(tenant_id))
  WITH CHECK (app_private.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.claim_provider_sync_capacity(
  p_tenant_id uuid,
  p_provider text,
  p_connection_id uuid,
  p_run_id uuid DEFAULT NULL,
  p_requests_per_minute integer DEFAULT 10,
  p_max_concurrency integer DEFAULT 2,
  p_lease_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window public.provider_governor_windows;
  v_active integer;
  v_token uuid;
  v_retry_after integer;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'tenant access denied';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || lower(p_provider), 99117));

  DELETE FROM public.provider_sync_leases WHERE expires_at <= v_now;
  SELECT * INTO v_window FROM public.provider_governor_windows
    WHERE tenant_id = p_tenant_id AND provider = lower(p_provider) FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.provider_governor_windows(tenant_id, provider, window_started_at, request_count)
    VALUES (p_tenant_id, lower(p_provider), v_now, 0)
    RETURNING * INTO v_window;
  ELSIF v_window.window_started_at <= v_now - interval '1 minute' THEN
    UPDATE public.provider_governor_windows
    SET window_started_at = v_now, request_count = 0, updated_at = v_now
    WHERE tenant_id = p_tenant_id AND provider = lower(p_provider)
    RETURNING * INTO v_window;
  END IF;

  SELECT count(*) INTO v_active FROM public.provider_sync_leases
    WHERE tenant_id = p_tenant_id AND provider = lower(p_provider) AND expires_at > v_now;
  IF v_active >= GREATEST(1, LEAST(COALESCE(p_max_concurrency, 2), 20)) THEN
    SELECT GREATEST(1, CEIL(EXTRACT(epoch FROM (min(expires_at) - v_now))))::integer
      INTO v_retry_after FROM public.provider_sync_leases
      WHERE tenant_id = p_tenant_id AND provider = lower(p_provider) AND expires_at > v_now;
    RETURN jsonb_build_object('acquired', false, 'reason', 'concurrency_limit', 'retryAfterSeconds', COALESCE(v_retry_after, 1));
  END IF;
  IF v_window.request_count >= GREATEST(1, LEAST(COALESCE(p_requests_per_minute, 10), 600)) THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'rate_limit', 'retryAfterSeconds',
      GREATEST(1, CEIL(EXTRACT(epoch FROM (v_window.window_started_at + interval '1 minute' - v_now)))::integer));
  END IF;

  v_token := gen_random_uuid();
  INSERT INTO public.provider_sync_leases(token, tenant_id, provider, connection_id, run_id, expires_at)
  VALUES (v_token, p_tenant_id, lower(p_provider), p_connection_id, p_run_id,
    v_now + make_interval(secs => GREATEST(30, LEAST(COALESCE(p_lease_seconds, 900), 3600))));
  UPDATE public.provider_governor_windows SET request_count = request_count + 1, updated_at = v_now
    WHERE tenant_id = p_tenant_id AND provider = lower(p_provider);
  RETURN jsonb_build_object('acquired', true, 'token', v_token, 'active', v_active + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_provider_sync_capacity(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE v_rows integer;
BEGIN
  DELETE FROM public.provider_sync_leases
  WHERE token = p_token
    AND (app_private.is_tenant_member(tenant_id) OR auth.role() = 'service_role');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_provider_sync_capacity(uuid,text,uuid,uuid,integer,integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_provider_sync_capacity(uuid) TO authenticated, service_role;
