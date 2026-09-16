-- Align the persisted capability registry with the provider adapters that are
-- actually present in the runtime. Connection/auth availability is not treated
-- as evidence availability.

-- Microsoft 365 uses the legacy m365 provider id in the integration registry.
-- The runtime adapter is the same provider and is intentionally supported under
-- both ids until all historical rows are migrated.
UPDATE public.provider_capabilities pc
SET implemented = true,
    notes = 'Backed by the live Microsoft Graph connector and Microsoft 365 capability router.'
FROM public.capabilities c
WHERE pc.capability_id = c.id
  AND pc.provider IN ('m365', 'microsoft365')
  AND c.capability_key IN ('license_inventory', 'user_inventory');

-- GitHub has a dedicated governed capability router backed by synchronized
-- provider evidence. Security findings are consumed by the Security Agent.
UPDATE public.provider_capabilities pc
SET implemented = true,
    notes = CASE c.capability_key
      WHEN 'repo_inventory' THEN 'Backed by the governed GitHub repository capability router.'
      WHEN 'security_findings' THEN 'Backed by the governed GitHub security capability router.'
      ELSE pc.notes
    END
FROM public.capabilities c
WHERE pc.provider = 'github'
  AND pc.capability_id = c.id
  AND c.capability_key IN ('repo_inventory', 'security_findings');

-- Productivity currently has a real synchronized work-item path for Jira.
-- Other providers remain false until their sync adapter emits user-attributed
-- work items; the UI must not imply otherwise.
UPDATE public.provider_capabilities pc
SET implemented = true,
    notes = 'Backed by synchronized Jira issue evidence and the Productivity Agent report runtime.'
FROM public.capabilities c
WHERE pc.provider = 'jira'
  AND pc.capability_id = c.id
  AND c.capability_key = 'productivity_activity';

-- Explicitly preserve false for providers whose current sync adapters do not
-- expose user-attributed work items. This makes the registry authoritative.
UPDATE public.provider_capabilities pc
SET implemented = false,
    notes = COALESCE(NULLIF(pc.notes, ''), 'Provider connection exists, but no governed runtime evidence adapter is implemented for this capability.')
FROM public.capabilities c
WHERE c.id = pc.capability_id
  AND c.capability_key = 'productivity_activity'
  AND pc.provider NOT IN ('jira');
