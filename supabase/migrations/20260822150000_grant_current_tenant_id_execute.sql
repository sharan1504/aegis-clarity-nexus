-- The tenant helper is SECURITY DEFINER and is used by RLS policies.
-- Explicitly grant execution to authenticated callers so PostgREST/RLS can
-- evaluate tenant membership without exposing the underlying profile query.
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.current_tenant_id() to service_role;
