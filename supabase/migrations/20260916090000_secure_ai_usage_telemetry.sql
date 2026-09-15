ALTER TABLE public.ai_usage_events
  ADD COLUMN IF NOT EXISTS cost_estimate numeric(18, 8) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ai_usage_events_tenant_agent_created_idx
  ON public.ai_usage_events(tenant_id, agent_key, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE INSERT ON public.ai_usage_events FROM authenticated;
REVOKE INSERT ON public.ai_usage_events FROM anon;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

DROP POLICY IF EXISTS "Tenant members can append AI usage" ON public.ai_usage_events;
DROP POLICY IF EXISTS "Tenant members can view AI usage" ON public.ai_usage_events;

CREATE POLICY "Tenant members can view AI usage"
  ON public.ai_usage_events
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Service role can append AI usage"
  ON public.ai_usage_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);
