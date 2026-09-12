CREATE POLICY "integration credentials server only"
ON public.integration_credentials
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "integration oauth states server only"
ON public.integration_oauth_states
FOR ALL TO service_role
USING (true)
WITH CHECK (true);