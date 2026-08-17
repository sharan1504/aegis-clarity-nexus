REVOKE EXECUTE ON FUNCTION public.instruction_version_bump() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.instruction_record_revision() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.instruction_revisions_immutable() FROM anon, authenticated;