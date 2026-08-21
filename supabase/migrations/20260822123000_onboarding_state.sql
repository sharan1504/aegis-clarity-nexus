-- The checklist is derived from live tenant state; this table only stores a
-- presentation preference so completion is never faked or persisted as truth.
CREATE TABLE IF NOT EXISTS public.tenant_ui_preferences (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  onboarding_collapsed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_ui_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.tenant_ui_preferences TO authenticated;
GRANT ALL ON public.tenant_ui_preferences TO service_role;

CREATE POLICY tenant_ui_preferences_select ON public.tenant_ui_preferences FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));
CREATE POLICY tenant_ui_preferences_insert ON public.tenant_ui_preferences FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id));
CREATE POLICY tenant_ui_preferences_update ON public.tenant_ui_preferences FOR UPDATE TO authenticated
  USING (app_private.is_tenant_member(tenant_id)) WITH CHECK (app_private.is_tenant_member(tenant_id));

CREATE TRIGGER tenant_ui_preferences_updated_at BEFORE UPDATE ON public.tenant_ui_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
