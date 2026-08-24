-- Department-aware data isolation for Aegis agents and AI analysis.
-- Department membership is a security boundary, not a UI filter.

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_department_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, department_id)
);

CREATE TABLE IF NOT EXISTS public.department_agent_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  agent_key text NOT NULL REFERENCES public.agent_definitions(agent_key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, department_id, agent_key)
);

CREATE INDEX IF NOT EXISTS user_department_memberships_user_idx
  ON public.user_department_memberships(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS department_agent_access_lookup_idx
  ON public.department_agent_access(tenant_id, department_id, agent_key);

GRANT SELECT ON public.departments TO authenticated;
GRANT SELECT ON public.user_department_memberships TO authenticated;
GRANT SELECT ON public.department_agent_access TO authenticated;
GRANT ALL ON public.departments, public.user_department_memberships, public.department_agent_access TO service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_department_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_agent_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departments readable" ON public.departments;
CREATE POLICY "departments readable" ON public.departments
  FOR SELECT TO authenticated USING (active = true);

DROP POLICY IF EXISTS "users can view own department memberships" ON public.user_department_memberships;
CREATE POLICY "users can view own department memberships" ON public.user_department_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND tenant_id = app_private.current_tenant_id());

DROP POLICY IF EXISTS "tenant admins manage department memberships" ON public.user_department_memberships;
CREATE POLICY "tenant admins manage department memberships" ON public.user_department_memberships
  FOR ALL TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

DROP POLICY IF EXISTS "tenant members view department agent access" ON public.department_agent_access;
CREATE POLICY "tenant members view department agent access" ON public.department_agent_access
  FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id());

DROP POLICY IF EXISTS "tenant admins manage department agent access" ON public.department_agent_access;
CREATE POLICY "tenant admins manage department agent access" ON public.department_agent_access
  FOR ALL TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

-- Seed the product's department catalogue. This is configuration, not business/demo data.
INSERT INTO public.departments (department_key, display_name, description) VALUES
  ('sales', 'Sales', 'Customer acquisition, opportunities, accounts and commercial activity.'),
  ('finance', 'Finance', 'Billing, cost, licensing, spend and financial operations.'),
  ('support', 'Support', 'Customer support, incidents, service operations and contact-center work.'),
  ('hr', 'HR', 'People operations, workforce and employee-related workflows.'),
  ('operations', 'Operations', 'Cross-functional operational execution and service workflows.'),
  ('security', 'Security', 'Security posture, identity, access and risk operations.'),
  ('it', 'IT', 'Technology operations, infrastructure and internal IT workflows.'),
  ('legal', 'Legal', 'Legal, compliance and governance workflows.'),
  ('other', 'Other', 'Additional department-specific workflows not covered above.')
ON CONFLICT (department_key) DO NOTHING;

-- Default department-to-agent configuration. Only existing agent definitions are granted access.
INSERT INTO public.department_agent_access (tenant_id, department_id, agent_key, enabled)
SELECT t.id, d.id, v.agent_key, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('sales','agent-workflow'), ('sales','agent-knowledge'),
  ('finance','agent-license'), ('finance','agent-cost'), ('finance','agent-knowledge'),
  ('support','agent-ccx'), ('support','agent-incident'), ('support','agent-knowledge'),
  ('hr','agent-security'), ('hr','agent-knowledge'),
  ('operations','agent-ccx'), ('operations','agent-incident'), ('operations','agent-workflow'),
  ('security','agent-security'),
  ('it','agent-security'), ('it','agent-incident'), ('it','agent-workflow'),
  ('legal','agent-knowledge'), ('legal','agent-security'),
  ('other','agent-knowledge')
) AS v(department_key, agent_key)
JOIN public.departments d ON d.department_key = v.department_key
JOIN public.agent_definitions a ON a.agent_key = v.agent_key
ON CONFLICT (tenant_id, department_id, agent_key) DO NOTHING;

-- Some environments do not yet have chat history tables. Do not make this migration fail
-- just because the optional chat-session table has not been deployed yet.
DO $$
BEGIN
  IF to_regclass('public.chat_sessions') IS NOT NULL THEN
    ALTER TABLE public.chat_sessions
      ADD COLUMN IF NOT EXISTS department_key text;
    CREATE INDEX IF NOT EXISTS chat_sessions_department_idx
      ON public.chat_sessions(tenant_id, user_id, department_key, updated_at DESC);
  END IF;
END $$;

COMMENT ON TABLE public.user_department_memberships IS
  'Security boundary: a user can only use department-scoped agents and evidence for departments they belong to.';
COMMENT ON TABLE public.department_agent_access IS
  'Maps departments to the agents they are permitted to use. This is enforced server-side before data is supplied to AI.';
