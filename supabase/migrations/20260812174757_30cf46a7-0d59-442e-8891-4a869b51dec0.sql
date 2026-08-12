-- current_tenant_id() is not referenced by any RLS policy and is not called by the app;
-- signed-in users have no reason to invoke it directly.
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM authenticated;
