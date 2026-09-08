-- Agent configuration v2: durable purpose/behavior and agent-level policy rules.
-- Purpose describes the stable responsibility of an agent. Policy rules are
-- organization-authored constraints evaluated by governed execution; they are
-- not provider connector logic and do not grant permissions.
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS purpose_behavior text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS policy_rules jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.agent_settings.purpose_behavior IS
  'Stable agent purpose, behavior and operating scope. This is instruction/context, not permission.';
COMMENT ON COLUMN public.agent_settings.policy_rules IS
  'Ordered agent-level policy rules. Each rule is structured metadata plus human-readable rule text; enforcement remains server-side.';

-- Keep the new policy surface bounded and JSON-only. Individual rule shape is
-- validated by the server before writes; this database check only rejects
-- obviously invalid container types.
ALTER TABLE public.agent_settings
  DROP CONSTRAINT IF EXISTS agent_settings_policy_rules_array;
ALTER TABLE public.agent_settings
  ADD CONSTRAINT agent_settings_policy_rules_array
  CHECK (jsonb_typeof(policy_rules) = 'array');
