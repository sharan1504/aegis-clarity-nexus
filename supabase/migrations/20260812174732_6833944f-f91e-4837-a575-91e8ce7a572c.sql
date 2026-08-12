-- Enforce role-based write access server-side for change management
DROP POLICY IF EXISTS "Approvers can update approvals" ON public.change_approvals;
CREATE POLICY "Admins and managers can update approvals"
ON public.change_approvals FOR UPDATE TO authenticated
USING (
  is_tenant_member(tenant_id)
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
)
WITH CHECK (
  is_tenant_member(tenant_id)
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

DROP POLICY IF EXISTS "Tenant members can update change records" ON public.change_records;
CREATE POLICY "Admins and managers can update change records"
ON public.change_records FOR UPDATE TO authenticated
USING (
  is_tenant_member(tenant_id)
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
)
WITH CHECK (
  is_tenant_member(tenant_id)
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

-- Only admins/managers may generate report exports
DROP POLICY IF EXISTS "Tenant members can create reports" ON public.reports;
CREATE POLICY "Admins and managers can create reports"
ON public.reports FOR INSERT TO authenticated
WITH CHECK (
  is_tenant_member(tenant_id)
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

DROP POLICY IF EXISTS "Tenant members can delete reports" ON public.reports;
CREATE POLICY "Admins can delete reports"
ON public.reports FOR DELETE TO authenticated
USING (is_tenant_member(tenant_id) AND has_role(auth.uid(), 'admin'::app_role));

-- Lock down SECURITY DEFINER functions that clients must never call directly.
-- Trigger functions run as the table owner, so revoking client EXECUTE is safe.
REVOKE ALL ON FUNCTION public.audit_log_seal() FROM authenticated, anon;
REVOKE ALL ON FUNCTION public.audit_log_block_mutation() FROM authenticated, anon;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM authenticated, anon;
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM anon;
