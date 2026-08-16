CREATE TABLE IF NOT EXISTS public.agent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_key text NOT NULL REFERENCES public.agent_definitions(agent_key) ON DELETE CASCADE,
  pre_instructions text,
  system_instructions text,
  post_instructions text,
  guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_key)
);

GRANT SELECT, INSERT, UPDATE ON public.agent_settings TO authenticated;
GRANT ALL ON public.agent_settings TO service_role;
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent settings select tenant"
  ON public.agent_settings FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE POLICY "agent settings insert managers"
  ON public.agent_settings FOR INSERT TO authenticated
  WITH CHECK (
    app_private.is_tenant_member(tenant_id)
    AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "agent settings update managers"
  ON public.agent_settings FOR UPDATE TO authenticated
  USING (
    app_private.is_tenant_member(tenant_id)
    AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (app_private.is_tenant_member(tenant_id));

CREATE TRIGGER agent_settings_updated_at
  BEFORE UPDATE ON public.agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS agent_settings_tenant_agent_idx
  ON public.agent_settings (tenant_id, agent_key);

INSERT INTO public.agent_settings (tenant_id, agent_key, pre_instructions, post_instructions)
SELECT t.id, 'agent-license',
  'Before analyzing licenses, verify that the source data is current and that the latest sync completed successfully.',
  'Every recommendation must include evidence, affected users, confidence, risk and recommended next step.'
FROM public.tenants t
ON CONFLICT (tenant_id, agent_key) DO NOTHING;