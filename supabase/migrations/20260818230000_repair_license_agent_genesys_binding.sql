-- Repair the live Genesys -> License Agent data-source registration.
--
-- The capability registry is provider/agent based, while bindings are tenant
-- integration based. The original development seed could run before a real
-- Genesys integration existed, leaving the live integration connected but
-- without a License Agent binding (or, in an incomplete migration history,
-- without one of the registry rows). Keep this migration idempotent.

-- 1. Ensure the provider-neutral capability exists.
INSERT INTO public.capabilities (
  capability_key,
  display_name,
  description,
  category,
  read_only,
  write_capable
)
VALUES (
  'license_inventory',
  'License Inventory',
  'Entitlement definitions and per-user license assignments.',
  'licensing',
  true,
  false
)
ON CONFLICT (capability_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    read_only = EXCLUDED.read_only,
    write_capable = EXCLUDED.write_capable;

-- 2. Ensure License Agent exists and requires the capability.
INSERT INTO public.agent_definitions (
  agent_key,
  display_name,
  description,
  category
)
VALUES (
  'agent-license',
  'License Optimization Agent',
  'Finds unused and over-provisioned entitlements across connected platforms.',
  'FinOps'
)
ON CONFLICT (agent_key) DO NOTHING;

INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
SELECT 'agent-license', c.id, true
FROM public.capabilities c
WHERE c.capability_key = 'license_inventory'
ON CONFLICT (agent_key, capability_id) DO UPDATE
SET required = true;

-- 3. Ensure Genesys exposes the capability.
INSERT INTO public.provider_capabilities (provider, capability_id, implemented, notes)
SELECT
  'genesys',
  c.id,
  true,
  'Backed by the live Genesys read-only sync.'
FROM public.capabilities c
WHERE c.capability_key = 'license_inventory'
ON CONFLICT (provider, capability_id) DO UPDATE
SET implemented = true,
    notes = COALESCE(EXCLUDED.notes, public.provider_capabilities.notes);

-- 4. Repair existing connected Genesys integrations that were created before
--    the agent binding seed ran. This is intentionally limited to the
--    License Agent + License Inventory capability and never crosses tenants.
INSERT INTO public.agent_integration_bindings (
  tenant_id,
  agent_key,
  integration_id,
  capability_id,
  enabled,
  policy,
  is_mock
)
SELECT
  i.tenant_id,
  'agent-license',
  i.id,
  c.id,
  true,
  '{"inactivity_threshold_days":90}'::jsonb,
  COALESCE(i.is_mock, false)
FROM public.integrations i
CROSS JOIN public.capabilities c
WHERE i.provider = 'genesys'
  AND i.status = 'connected'
  AND c.capability_key = 'license_inventory'
ON CONFLICT (tenant_id, agent_key, integration_id, capability_id) DO NOTHING;
