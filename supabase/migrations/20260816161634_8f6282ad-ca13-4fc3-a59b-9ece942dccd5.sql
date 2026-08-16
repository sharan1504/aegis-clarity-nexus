-- ============ A. integrations: provider-agnostic metadata ============
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS is_mock boolean NOT NULL DEFAULT false;

UPDATE public.integrations SET display_name = 'Genesys Cloud'
  WHERE provider = 'genesys' AND display_name IS NULL;

-- ============ B. capabilities registry (global) ============
CREATE TABLE IF NOT EXISTS public.capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'inventory',
  read_only boolean NOT NULL DEFAULT true,
  write_capable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.capabilities TO authenticated;
GRANT ALL ON public.capabilities TO service_role;
ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "capabilities readable by authenticated" ON public.capabilities;
CREATE POLICY "capabilities readable by authenticated"
  ON public.capabilities FOR SELECT TO authenticated USING (true);

-- ============ C. provider -> capability map (global) ============
CREATE TABLE IF NOT EXISTS public.provider_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  capability_id uuid NOT NULL REFERENCES public.capabilities(id) ON DELETE CASCADE,
  implemented boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, capability_id)
);
GRANT SELECT ON public.provider_capabilities TO authenticated;
GRANT ALL ON public.provider_capabilities TO service_role;
ALTER TABLE public.provider_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provider capabilities readable by authenticated" ON public.provider_capabilities;
CREATE POLICY "provider capabilities readable by authenticated"
  ON public.provider_capabilities FOR SELECT TO authenticated USING (true);

-- ============ D. agent catalogue + agent capabilities (global) ============
CREATE TABLE IF NOT EXISTS public.agent_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_definitions TO authenticated;
GRANT ALL ON public.agent_definitions TO service_role;
ALTER TABLE public.agent_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent definitions readable by authenticated" ON public.agent_definitions;
CREATE POLICY "agent definitions readable by authenticated"
  ON public.agent_definitions FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.agent_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL REFERENCES public.agent_definitions(agent_key) ON DELETE CASCADE,
  capability_id uuid NOT NULL REFERENCES public.capabilities(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_key, capability_id)
);
GRANT SELECT ON public.agent_capabilities TO authenticated;
GRANT ALL ON public.agent_capabilities TO service_role;
ALTER TABLE public.agent_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent capabilities readable by authenticated" ON public.agent_capabilities;
CREATE POLICY "agent capabilities readable by authenticated"
  ON public.agent_capabilities FOR SELECT TO authenticated USING (true);

-- ============ E. tenant-scoped agent <-> integration bindings ============
CREATE TABLE IF NOT EXISTS public.agent_integration_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_key text NOT NULL REFERENCES public.agent_definitions(agent_key) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  capability_id uuid NOT NULL REFERENCES public.capabilities(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_mock boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_key, integration_id, capability_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_integration_bindings TO authenticated;
GRANT ALL ON public.agent_integration_bindings TO service_role;
ALTER TABLE public.agent_integration_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bindings select tenant" ON public.agent_integration_bindings;
CREATE POLICY "bindings select tenant"
  ON public.agent_integration_bindings FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "bindings insert managers" ON public.agent_integration_bindings;
CREATE POLICY "bindings insert managers"
  ON public.agent_integration_bindings FOR INSERT TO authenticated
  WITH CHECK (
    app_private.is_tenant_member(tenant_id)
    AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager'))
    AND EXISTS (
      SELECT 1 FROM public.integrations i
      WHERE i.id = integration_id AND i.tenant_id = agent_integration_bindings.tenant_id
    )
    AND EXISTS (
      SELECT 1 FROM public.agent_capabilities ac
      WHERE ac.agent_key = agent_integration_bindings.agent_key
        AND ac.capability_id = agent_integration_bindings.capability_id
    )
  );

DROP POLICY IF EXISTS "bindings update managers" ON public.agent_integration_bindings;
CREATE POLICY "bindings update managers"
  ON public.agent_integration_bindings FOR UPDATE TO authenticated
  USING (
    app_private.is_tenant_member(tenant_id)
    AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (app_private.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "bindings delete managers" ON public.agent_integration_bindings;
CREATE POLICY "bindings delete managers"
  ON public.agent_integration_bindings FOR DELETE TO authenticated
  USING (
    app_private.is_tenant_member(tenant_id)
    AND (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'manager'))
  );

CREATE TRIGGER agent_integration_bindings_updated_at
  BEFORE UPDATE ON public.agent_integration_bindings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS aib_tenant_agent_idx
  ON public.agent_integration_bindings (tenant_id, agent_key);
CREATE INDEX IF NOT EXISTS aib_tenant_integration_idx
  ON public.agent_integration_bindings (tenant_id, integration_id);
CREATE INDEX IF NOT EXISTS aib_capability_idx
  ON public.agent_integration_bindings (capability_id);

-- ============ F. seed the registries ============
INSERT INTO public.capabilities (capability_key, display_name, description, category, read_only, write_capable) VALUES
  ('license_inventory','License Inventory','Entitlement definitions and per-user license assignments.','licensing',true,false),
  ('user_inventory','User Inventory','Directory of users, their state, and activity signals.','identity',true,false),
  ('queue_inventory','Queue Inventory','Contact routing queues and their membership.','contact_center',true,false),
  ('routing_inventory','Routing Information','Routing rules, skills, and distribution configuration.','contact_center',true,false),
  ('presence_inventory','Presence Inventory','User presence and availability states.','contact_center',true,false),
  ('cloud_resource_inventory','Cloud Resources','Compute, storage, and network resource inventory.','cloud',true,false),
  ('cost_inventory','Cost Data','Billing, spend, and usage cost data.','finops',true,false),
  ('security_findings','Security Findings','Posture findings, misconfigurations, and alerts.','security',true,false)
ON CONFLICT (capability_key) DO NOTHING;

INSERT INTO public.provider_capabilities (provider, capability_id, implemented, notes)
SELECT v.provider, c.id, v.implemented, v.notes
FROM (VALUES
  ('genesys','license_inventory',true,'Backed by the live Genesys read-only sync.'),
  ('genesys','user_inventory',true,'Backed by the live Genesys read-only sync.'),
  ('genesys','queue_inventory',true,'Backed by the live Genesys read-only sync.'),
  ('genesys','routing_inventory',false,'Planned — routing rules are not synced yet.'),
  ('genesys','presence_inventory',true,'Presence is captured with each user record.'),
  ('microsoft365','license_inventory',false,'Planned — Microsoft Graph connector not implemented.'),
  ('microsoft365','user_inventory',false,'Planned — Microsoft Graph connector not implemented.'),
  ('microsoft365','security_findings',false,'Planned.'),
  ('aws','cloud_resource_inventory',false,'Planned.'),
  ('aws','cost_inventory',false,'Planned.'),
  ('aws','user_inventory',false,'Planned — IAM principals.'),
  ('salesforce','license_inventory',false,'Planned.'),
  ('salesforce','user_inventory',false,'Planned.'),
  ('servicenow','user_inventory',false,'Planned.'),
  ('jira','user_inventory',false,'Planned.')
) AS v(provider, capability_key, implemented, notes)
JOIN public.capabilities c ON c.capability_key = v.capability_key
ON CONFLICT (provider, capability_id) DO NOTHING;

INSERT INTO public.agent_definitions (agent_key, display_name, description, category) VALUES
  ('agent-license','License Optimization Agent','Finds unused and over-provisioned entitlements across connected platforms.','FinOps'),
  ('agent-cost','Cloud Optimization Agent','Analyses cloud spend and right-sizing opportunities.','FinOps'),
  ('agent-security','Security Agent','Correlates identity and posture findings across platforms.','Security'),
  ('agent-ccx','Routing Agent','Reviews contact routing, queues, and distribution health.','Operations'),
  ('agent-incident','Incident Agent','Triages incidents and correlates service signals.','Operations'),
  ('agent-knowledge','Knowledge Assistant','Answers operational questions from connected system data.','Productivity'),
  ('agent-workflow','Workflow Agent','Coordinates multi-step operational workflows.','Automation')
ON CONFLICT (agent_key) DO NOTHING;

INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
SELECT v.agent_key, c.id, v.required
FROM (VALUES
  ('agent-license','license_inventory',true),
  ('agent-license','user_inventory',true),
  ('agent-cost','cost_inventory',true),
  ('agent-cost','cloud_resource_inventory',false),
  ('agent-security','security_findings',true),
  ('agent-security','user_inventory',true),
  ('agent-ccx','queue_inventory',true),
  ('agent-ccx','routing_inventory',false),
  ('agent-ccx','user_inventory',false),
  ('agent-ccx','presence_inventory',false),
  ('agent-incident','security_findings',false),
  ('agent-incident','user_inventory',false),
  ('agent-knowledge','user_inventory',false),
  ('agent-knowledge','license_inventory',false),
  ('agent-workflow','user_inventory',false)
) AS v(agent_key, capability_key, required)
JOIN public.capabilities c ON c.capability_key = v.capability_key
ON CONFLICT (agent_key, capability_id) DO NOTHING;

-- ============ G. development seed: mock integrations + bindings ============
INSERT INTO public.integrations (tenant_id, provider, display_name, status, health_status, is_mock, metadata, scopes)
SELECT t.id, v.provider, v.display_name, 'connected', 'healthy', true, '{"seed":"development"}'::jsonb, '{}'
FROM public.tenants t
CROSS JOIN (VALUES
  ('microsoft365','Microsoft 365'),
  ('aws','AWS')
) AS v(provider, display_name)
ON CONFLICT (tenant_id, provider) DO NOTHING;

INSERT INTO public.agent_integration_bindings (tenant_id, agent_key, integration_id, capability_id, enabled, policy, is_mock)
SELECT i.tenant_id, v.agent_key, i.id, c.id, true, v.policy::jsonb, i.is_mock
FROM (VALUES
  ('agent-license','genesys','license_inventory','{"inactivity_threshold_days":90}'),
  ('agent-license','genesys','user_inventory','{}'),
  ('agent-license','microsoft365','license_inventory','{"inactivity_threshold_days":60}'),
  ('agent-ccx','genesys','queue_inventory','{}'),
  ('agent-security','microsoft365','user_inventory','{}'),
  ('agent-cost','aws','cost_inventory','{}')
) AS v(agent_key, provider, capability_key, policy)
JOIN public.integrations i ON i.provider = v.provider
JOIN public.capabilities c ON c.capability_key = v.capability_key
ON CONFLICT (tenant_id, agent_key, integration_id, capability_id) DO NOTHING;