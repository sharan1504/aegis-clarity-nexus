-- License Agent governance defaults.
-- Keeps the agent read-only at both instruction and enforcement layers.

UPDATE public.agent_settings
SET system_instructions = 'You are a read-only License Optimization Agent. Only analyze license utilization, assignments, entitlement usage, and optimization opportunities. Never modify, assign, remove, purchase, revoke, or otherwise change licenses. Every recommendation must be evidence-based and include affected users, confidence, risk, and a recommended next step.',
    updated_at = now()
WHERE agent_key = 'agent-license';

INSERT INTO public.guardrails (
  tenant_id,
  name,
  description,
  scope,
  scope_id,
  guardrail_type,
  enabled,
  priority,
  severity,
  enforcement_mode,
  conditions,
  action,
  message,
  is_system,
  version
)
SELECT
  i.tenant_id,
  'License Agent is read-only',
  'Prevents the License Optimization Agent from performing license-changing actions.',
  'agent',
  'agent-license',
  'block',
  true,
  1,
  'critical',
  'enforce',
  '{"is_write":true}'::jsonb,
  '{"effect":"block"}'::jsonb,
  'License Optimization Agent is read-only and cannot perform license-changing actions.',
  false,
  1
FROM public.integrations i
WHERE i.provider = 'genesys'
  AND i.status = 'connected'
  AND NOT EXISTS (
    SELECT 1
    FROM public.guardrails g
    WHERE g.tenant_id = i.tenant_id
      AND g.scope = 'agent'
      AND g.scope_id = 'agent-license'
      AND g.name = 'License Agent is read-only'
  )
LIMIT 1;
