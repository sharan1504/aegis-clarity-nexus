-- License optimization benefits from queue membership and presence/activity
-- context already exposed by the live Genesys capability contracts.
INSERT INTO public.agent_capabilities (agent_key, capability_id, required)
SELECT 'agent-license', c.id, false
FROM public.capabilities c
WHERE c.capability_key IN ('queue_inventory', 'presence_inventory')
ON CONFLICT (agent_key, capability_id) DO NOTHING;
