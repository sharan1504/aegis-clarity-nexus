-- Enterprise live settings + analytics usage.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS primary_domain text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS analytics_settings jsonb NOT NULL DEFAULT '{"serviceLevel":{"targetSeconds":30,"targetPercent":80},"dataMasking":true,"disconnectMetricWindowMinutes":30,"retentionDays":90}'::jsonb;

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_key text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_events_tenant_created_idx ON public.ai_usage_events(tenant_id, created_at DESC);
GRANT SELECT, INSERT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant members can view AI usage" ON public.ai_usage_events;
CREATE POLICY "Tenant members can view AI usage" ON public.ai_usage_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Tenant members can append AI usage" ON public.ai_usage_events;
CREATE POLICY "Tenant members can append AI usage" ON public.ai_usage_events FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id));

ALTER TABLE public.genesys_users REPLICA IDENTITY FULL;
ALTER TABLE public.genesys_licenses REPLICA IDENTITY FULL;
ALTER TABLE public.genesys_queues REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.genesys_users;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.genesys_licenses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.genesys_queues;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
