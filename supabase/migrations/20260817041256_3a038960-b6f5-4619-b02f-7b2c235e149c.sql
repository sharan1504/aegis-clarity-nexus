DROP POLICY IF EXISTS guardrails_select ON public.guardrails;
CREATE POLICY guardrails_select ON public.guardrails
FOR SELECT TO authenticated
USING (
  (tenant_id IS NOT NULL AND app_private.is_tenant_member(tenant_id))
  OR (tenant_id IS NULL AND is_system = true AND app_private.is_tenant_member(public.current_tenant_id()))
);

DROP POLICY IF EXISTS guardrail_revisions_select ON public.guardrail_revisions;
CREATE POLICY guardrail_revisions_select ON public.guardrail_revisions
FOR SELECT TO authenticated
USING (
  (tenant_id IS NOT NULL AND app_private.is_tenant_member(tenant_id))
  OR (
    tenant_id IS NULL
    AND app_private.is_tenant_member(public.current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.guardrails g
      WHERE g.id = guardrail_revisions.guardrail_id
        AND g.tenant_id IS NULL
        AND g.is_system = true
    )
  )
);