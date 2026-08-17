-- Last policy still calling the now-unexecutable public.current_tenant_id():
-- agent policy revision history failed for the same reason guardrails did.
DROP POLICY IF EXISTS "Tenant members can view policy revisions" ON public.agent_policy_revisions;
CREATE POLICY "Tenant members can view policy revisions"
ON public.agent_policy_revisions
FOR SELECT TO authenticated
USING (app_private.is_tenant_member(tenant_id));