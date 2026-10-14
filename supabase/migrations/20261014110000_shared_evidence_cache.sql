-- Shared evidence cache with tenant-scoped generation counters.
-- Local memory is only an optimization; every read checks the database generation.
CREATE TABLE IF NOT EXISTS public.evidence_cache_versions (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.evidence_cache_entries (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  data_type text NOT NULL,
  scope_key text NOT NULL,
  generation bigint NOT NULL,
  value jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, data_type, scope_key)
);
CREATE INDEX IF NOT EXISTS evidence_cache_entries_expiry_idx
  ON public.evidence_cache_entries (expires_at);

ALTER TABLE public.evidence_cache_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_cache_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_cache_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_cache_entries TO authenticated;
GRANT ALL ON public.evidence_cache_versions TO service_role;
GRANT ALL ON public.evidence_cache_entries TO service_role;

DROP POLICY IF EXISTS evidence_cache_versions_tenant_policy ON public.evidence_cache_versions;
CREATE POLICY evidence_cache_versions_tenant_policy ON public.evidence_cache_versions
  FOR ALL TO authenticated
  USING (app_private.is_tenant_member(tenant_id))
  WITH CHECK (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS evidence_cache_entries_tenant_policy ON public.evidence_cache_entries;
CREATE POLICY evidence_cache_entries_tenant_policy ON public.evidence_cache_entries
  FOR ALL TO authenticated
  USING (app_private.is_tenant_member(tenant_id))
  WITH CHECK (app_private.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.invalidate_evidence_cache(p_tenant_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE v_generation bigint;
BEGIN
  IF NOT app_private.is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant access denied';
  END IF;
  INSERT INTO public.evidence_cache_versions (tenant_id, generation)
  VALUES (p_tenant_id, 2)
  ON CONFLICT (tenant_id) DO UPDATE
    SET generation = public.evidence_cache_versions.generation + 1,
        updated_at = now()
  RETURNING generation INTO v_generation;
  RETURN v_generation;
END;
$$;
GRANT EXECUTE ON FUNCTION public.invalidate_evidence_cache(uuid) TO authenticated, service_role;
