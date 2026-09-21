REVOKE SELECT (encrypted_auth) ON public.mcp_server_connections FROM authenticated;
GRANT SELECT (encrypted_auth) ON public.mcp_server_connections TO service_role;
