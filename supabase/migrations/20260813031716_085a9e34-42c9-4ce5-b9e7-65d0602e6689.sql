-- ============ provider-agnostic integrations ============
CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  health_status text NOT NULL DEFAULT 'unknown',
  health_detail text,
  region text,
  external_org_id text,
  external_org_name text,
  scopes text[] NOT NULL DEFAULT '{}',
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  connected_at timestamptz,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

GRANT SELECT ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view integrations"
  ON public.integrations FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ server-only credential vault ============
CREATE TABLE public.integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL UNIQUE REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id text,
  client_secret text,
  access_token text,
  refresh_token text,
  token_type text,
  expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No grants to anon/authenticated: tokens are unreadable from the Data API.
GRANT ALL ON public.integration_credentials TO service_role;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER integration_credentials_updated_at BEFORE UPDATE ON public.integration_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ server-only OAuth state ============
CREATE TABLE public.integration_oauth_states (
  state text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  region text,
  redirect_uri text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.integration_oauth_states TO service_role;
ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;

-- ============ sync run history ============
CREATE TABLE public.integration_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_code text,
  error_message text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integration_sync_runs TO authenticated;
GRANT ALL ON public.integration_sync_runs TO service_role;
ALTER TABLE public.integration_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view sync runs"
  ON public.integration_sync_runs FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE INDEX integration_sync_runs_integration_idx
  ON public.integration_sync_runs (integration_id, started_at DESC);

-- ============ Genesys data models ============
CREATE TABLE public.genesys_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  genesys_user_id text NOT NULL,
  name text,
  email text,
  title text,
  department text,
  state text,
  presence text,
  license_name text,
  division_name text,
  last_login_at timestamptz,
  date_created timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, genesys_user_id)
);

GRANT SELECT ON public.genesys_users TO authenticated;
GRANT ALL ON public.genesys_users TO service_role;
ALTER TABLE public.genesys_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view genesys users"
  ON public.genesys_users FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE TRIGGER genesys_users_updated_at BEFORE UPDATE ON public.genesys_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.genesys_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  license_id text NOT NULL,
  name text,
  permissions text[] NOT NULL DEFAULT '{}',
  assigned_count integer NOT NULL DEFAULT 0,
  total_count integer,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, license_id)
);

GRANT SELECT ON public.genesys_licenses TO authenticated;
GRANT ALL ON public.genesys_licenses TO service_role;
ALTER TABLE public.genesys_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view genesys licenses"
  ON public.genesys_licenses FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE TRIGGER genesys_licenses_updated_at BEFORE UPDATE ON public.genesys_licenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.genesys_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  queue_id text NOT NULL,
  name text,
  description text,
  division_name text,
  member_count integer,
  media_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  date_created timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, queue_id)
);

GRANT SELECT ON public.genesys_queues TO authenticated;
GRANT ALL ON public.genesys_queues TO service_role;
ALTER TABLE public.genesys_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view genesys queues"
  ON public.genesys_queues FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

CREATE TRIGGER genesys_queues_updated_at BEFORE UPDATE ON public.genesys_queues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();