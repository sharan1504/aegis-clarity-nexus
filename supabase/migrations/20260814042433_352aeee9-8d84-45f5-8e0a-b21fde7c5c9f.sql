CREATE TABLE public.genesys_user_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  genesys_user_id text NOT NULL,
  license_id text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, genesys_user_id, license_id)
);

CREATE INDEX genesys_user_licenses_tenant_idx ON public.genesys_user_licenses (tenant_id);
CREATE INDEX genesys_user_licenses_user_idx ON public.genesys_user_licenses (integration_id, genesys_user_id);
CREATE INDEX genesys_user_licenses_license_idx ON public.genesys_user_licenses (integration_id, license_id);

GRANT SELECT ON public.genesys_user_licenses TO authenticated;
GRANT ALL ON public.genesys_user_licenses TO service_role;

ALTER TABLE public.genesys_user_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view genesys user licenses"
ON public.genesys_user_licenses
FOR SELECT
TO authenticated
USING (app_private.is_tenant_member(tenant_id));

CREATE TRIGGER genesys_user_licenses_updated_at
BEFORE UPDATE ON public.genesys_user_licenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();