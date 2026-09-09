-- Extend the immutable agent run event contract for governed MCP tool calls.
-- Tool events are observational and do not grant execution permission.

ALTER TABLE public.agent_run_events
  DROP CONSTRAINT IF EXISTS agent_run_events_event_type_check;

ALTER TABLE public.agent_run_events
  ADD CONSTRAINT agent_run_events_event_type_check CHECK (event_type IN (
    'run_created','stage_started','stage_completed','approval_requested',
    'approval_resolved','tool_call','execution_attempted','execution_completed',
    'verification_completed','run_failed','run_cancelled'
  ));

COMMENT ON COLUMN public.agent_run_events.event_type IS
  'Immutable runtime event type. tool_call records a governed MCP tool invocation outcome and never grants execution permission.';
