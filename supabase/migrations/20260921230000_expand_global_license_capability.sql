-- Make existing license-capable providers first-class License Agent sources.
-- Only providers with a real capability-router implementation are marked implemented.

INSERT INTO public.provider_capabilities (provider, capability_id, implemented, notes)
SELECT v.provider, c.id, v.implemented, v.notes
FROM (VALUES
  ('genesys', true, 'Existing Genesys read-only license and user inventory.'),
  ('microsoft365', true, 'Microsoft Graph normalized license and user inventory.'),
  ('m365', true, 'Alias for microsoft365; resolved to the canonical router provider id.'),
  ('salesforce', false, 'No license_inventory implementation in the capability router yet.'),
  ('servicenow', false, 'No license_inventory implementation in the capability router yet.'),
  ('slack', false, 'No license_inventory implementation in the capability router yet.')
) AS v(provider, implemented, notes)
CROSS JOIN public.capabilities c
WHERE c.capability_key = 'license_inventory'
ON CONFLICT (provider, capability_id) DO UPDATE
SET implemented = EXCLUDED.implemented,
    notes = EXCLUDED.notes;

INSERT INTO public.provider_capabilities (provider, capability_id, implemented, notes)
SELECT v.provider, c.id, v.implemented, v.notes
FROM (VALUES
  ('genesys', true, 'Existing Genesys user inventory.'),
  ('microsoft365', true, 'Microsoft Graph normalized user inventory.'),
  ('m365', true, 'Alias for microsoft365; resolved to the canonical router provider id.')
) AS v(provider, implemented, notes)
CROSS JOIN public.capabilities c
WHERE c.capability_key = 'user_inventory'
ON CONFLICT (provider, capability_id) DO UPDATE
SET implemented = EXCLUDED.implemented,
    notes = EXCLUDED.notes;

-- Bind every already-connected license-capable instance. This is intentionally
-- per integration so multiple M365 instances remain independent sources.
INSERT INTO public.agent_integration_bindings (
  tenant_id, agent_key, integration_id, capability_id, enabled, policy, is_mock,
  policy_version, policy_updated_at, policy_updated_by
)
SELECT
  i.tenant_id,
  'agent-license',
  i.id,
  c.id,
  true,
  CASE WHEN c.capability_key = 'license_inventory' AND i.provider IN ('microsoft365', 'm365')
    THEN '{"inactivity_threshold_days":60}'::jsonb
    ELSE '{"inactivity_threshold_days":90}'::jsonb
  END,
  COALESCE(i.is_mock, false),
  1,
  now(),
  NULL
FROM public.integrations i
JOIN public.provider_capabilities pc
  ON pc.provider = i.provider
 AND pc.implemented = true
JOIN public.capabilities c
  ON c.id = pc.capability_id
WHERE i.provider IN ('genesys', 'microsoft365', 'm365')
  AND i.status = 'connected'
  AND c.capability_key IN ('license_inventory', 'user_inventory')
ON CONFLICT (tenant_id, agent_key, integration_id, capability_id) DO NOTHING;
