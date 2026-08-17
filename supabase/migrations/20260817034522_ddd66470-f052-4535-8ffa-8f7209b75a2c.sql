REVOKE ALL ON FUNCTION public.guardrail_version_bump() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardrail_record_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardrail_revisions_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardrail_version_bump() TO service_role;
GRANT EXECUTE ON FUNCTION public.guardrail_record_revision() TO service_role;
GRANT EXECUTE ON FUNCTION public.guardrail_revisions_immutable() TO service_role;