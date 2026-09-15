-- Fix AI usage analytics persistence.
-- The existing ai_usage_events writer already inserts cost_estimate, but the
-- original table definition omitted that column. That caused every usage insert
-- to fail while the model completion itself still succeeded.
ALTER TABLE public.ai_usage_events
  ADD COLUMN IF NOT EXISTS cost_estimate numeric(18,8) NOT NULL DEFAULT 0;

-- Usage events are server telemetry. Browser/authenticated clients may read
-- tenant-scoped rows, but they must not be able to manufacture usage records.
REVOKE INSERT ON public.ai_usage_events FROM authenticated;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE ON public.ai_usage_events TO service_role;

DROP POLICY IF EXISTS "Tenant members can append AI usage" ON public.ai_usage_events;

-- service_role bypasses RLS and is the only role granted INSERT above.
-- Keep tenant-scoped reads for the Analytics server function.
DROP POLICY IF EXISTS "Tenant members can view AI usage" ON public.ai_usage_events;
CREATE POLICY "Tenant members can view AI usage"
  ON public.ai_usage_events
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE INDEX IF NOT EXISTS ai_usage_events_tenant_agent_created_idx
  ON public.ai_usage_events(tenant_id, agent_key, created_at DESC);
