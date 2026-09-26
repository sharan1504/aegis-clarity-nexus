-- Persistent per-user onboarding/discovery state.
-- This is presentation state only; product completion is derived from real navigation
-- and never grants access or capability.
CREATE TABLE IF NOT EXISTS public.user_onboarding_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tour_completed boolean NOT NULL DEFAULT false,
  tour_dismissed boolean NOT NULL DEFAULT false,
  visited_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_onboarding_state ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.user_onboarding_state TO authenticated;
GRANT ALL ON public.user_onboarding_state TO service_role;

CREATE POLICY user_onboarding_state_select
  ON public.user_onboarding_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND app_private.is_tenant_member(tenant_id));

CREATE POLICY user_onboarding_state_insert
  ON public.user_onboarding_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND app_private.is_tenant_member(tenant_id));

CREATE POLICY user_onboarding_state_update
  ON public.user_onboarding_state
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND app_private.is_tenant_member(tenant_id))
  WITH CHECK (user_id = auth.uid() AND app_private.is_tenant_member(tenant_id));

CREATE TRIGGER user_onboarding_state_updated_at
  BEFORE UPDATE ON public.user_onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
