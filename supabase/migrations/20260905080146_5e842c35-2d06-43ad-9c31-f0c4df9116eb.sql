REVOKE ALL ON FUNCTION public.enforce_profile_tenant_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_profile_tenant_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_profile_tenant_immutability() FROM authenticated;