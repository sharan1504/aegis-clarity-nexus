-- CenOps Productivity Agent
-- Provider-agnostic productivity analytics over synchronized provider evidence.

INSERT INTO public.capabilities (capability_key, display_name, description, category, read_only, write_capable)
VALUES ('productivity_activity','Productivity Activity','User-attributed work activity, work-item lifecycle and throughput signals from connected providers.','productivity',true,false)
ON CONFLICT (capability_key) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, category = EXCLUDED.category, read_only = true, write_capable = false;

INSERT INTO public.agent_definitions (agent_key, display_name, description, category)
VALUES ('agent-productivity','Productivity Agent','Measures individual and team productivity across connected business, CRM, ITSM, contact-center and collaboration platforms using governed provider evidence.','Productivity')
ON CONFLICT (agent_key) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, category = EXCLUDED.category;

INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
SELECT 'agent-productivity', id, true FROM public.capabilities WHERE capability_key = 'productivity_activity'
ON CONFLICT (agent_key, capability_id) DO UPDATE SET required = true;
INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
SELECT 'agent-productivity', id, false FROM public.capabilities WHERE capability_key = 'user_inventory'
ON CONFLICT (agent_key, capability_id) DO NOTHING;

INSERT INTO public.provider_capabilities (provider, capability_id, implemented, notes)
SELECT p.provider, c.id, false, 'Provider adapter must expose user-attributed work-item activity before live productivity analysis is available.'
FROM (VALUES ('genesys'),('aws'),('azure'),('m365'),('jira'),('servicenow'),('salesforce'),('slack'),('github'),('gcp'),('google-workspace'),('freshworks'),('zendesk'),('zoho'),('hubspot'),('gitlab'),('confluence'),('rubrik'),('veeam'),('cohesity'),('crowdstrike'),('microsoft-defender'),('okta'),('datadog'),('newrelic'),('splunk'),('pagerduty'),('workday'),('sap'),('oracle'),('snowflake'),('mongodb')) AS p(provider)
CROSS JOIN (SELECT id FROM public.capabilities WHERE capability_key = 'productivity_activity') c
ON CONFLICT (provider, capability_id) DO NOTHING;

INSERT INTO public.agent_integration_bindings (tenant_id, agent_key, integration_id, capability_id, enabled, policy, is_mock)
SELECT i.tenant_id, 'agent-productivity', i.id, c.id, true, '{"default_window":"month","max_report_rows":100,"approval_mode":"read_only"}'::jsonb, COALESCE(i.is_mock, false)
FROM public.integrations i
CROSS JOIN (SELECT id FROM public.capabilities WHERE capability_key = 'productivity_activity') c
ON CONFLICT (tenant_id, agent_key, integration_id, capability_id) DO NOTHING;

INSERT INTO public.department_agent_access (tenant_id, department_id, agent_key, enabled)
SELECT t.id, d.id, 'agent-productivity', true
FROM public.tenants t CROSS JOIN public.departments d
WHERE d.active = true
ON CONFLICT (tenant_id, department_id, agent_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS provider_sync_entities_productivity_lookup_idx ON public.provider_sync_entities (tenant_id, provider, entity_type, observed_at DESC);
