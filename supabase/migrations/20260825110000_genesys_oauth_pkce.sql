-- Store the PKCE verifier server-side for Genesys Code Authorization / PKCE clients.
-- The verifier is never returned to the browser; only the challenge is sent to Genesys.
ALTER TABLE public.integration_oauth_states
  ADD COLUMN IF NOT EXISTS code_verifier text;

COMMENT ON COLUMN public.integration_oauth_states.code_verifier IS
  'Short-lived server-side PKCE verifier for OAuth authorization-code exchanges.';
