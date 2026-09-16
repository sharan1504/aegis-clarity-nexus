-- Provider connections are the credential/control-plane record; integrations are
-- the agent/evidence-plane record. Every live provider connection must have one
-- corresponding integration row so agents do not operate on a disconnected
-- catalog.

CREATE OR REPLACE FUNCTION public.sync_provider_connection_integration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider text;
  v_integration_id uuid;
  v_status text;
  v_health text;
BEGIN
  -- Keep the historical m365 credential id, but expose the canonical runtime
  -- provider id to the agent capability layer.
  v_provider := CASE WHEN NEW.provider = 'm365' THEN 'microsoft365' ELSE NEW.provider END;
  v_status := CASE NEW.status
    WHEN 'connected' THEN 'connected'
    WHEN 'disconnected' THEN 'disconnected'
    ELSE 'failed'
  END;
  v_health := CASE NEW.status
    WHEN 'connected' THEN 'healthy'
    ELSE 'error'
  END;

  v_integration_id := NEW.integration_id;

  IF v_integration_id IS NULL THEN
    INSERT INTO public.integrations (
      tenant_id,
      provider,
      display_name,
      status,
      health_status,
      external_org_id,
      external_org_name,
      metadata,
      last_sync_at,
      last_sync_error,
      connected_at
    ) VALUES (
      NEW.tenant_id,
      v_provider,
      NEW.display_name,
      v_status,
      v_health,
      NEW.external_id,
      NEW.display_name,
      jsonb_build_object('provider_connection_id', NEW.id::text),
      NEW.last_sync_at,
      NEW.last_error,
      NEW.connected_at
    )
    RETURNING id INTO v_integration_id;

    UPDATE public.provider_connections
    SET integration_id = v_integration_id,
        updated_at = now()
    WHERE id = NEW.id;
  ELSE
    UPDATE public.integrations
    SET provider = v_provider,
        display_name = COALESCE(NEW.display_name, display_name),
        status = v_status,
        health_status = v_health,
        external_org_id = COALESCE(NEW.external_id, external_org_id),
        external_org_name = COALESCE(NEW.display_name, external_org_name),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('provider_connection_id', NEW.id::text),
        last_sync_at = NEW.last_sync_at,
        last_sync_error = NEW.last_error,
        connected_at = NEW.connected_at,
        updated_at = now()
    WHERE id = v_integration_id
      AND tenant_id = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_connection_integration_sync ON public.provider_connections;
CREATE TRIGGER provider_connection_integration_sync
AFTER INSERT OR UPDATE OF provider, external_id, display_name, status, last_sync_at, last_error, connected_at, integration_id
ON public.provider_connections
FOR EACH ROW
EXECUTE FUNCTION public.sync_provider_connection_integration();

-- Backfill all existing provider connections. The trigger creates one
-- integration record per connection and stores the reverse reference in
-- metadata, after which the UPDATE associates provider_connections.integration_id.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.provider_connections
    WHERE integration_id IS NULL
  LOOP
    UPDATE public.provider_connections
    SET updated_at = now()
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Existing integrations that were created from the legacy m365 id are moved to
-- the canonical agent-runtime id. Historical credential records are untouched.
UPDATE public.integrations
SET provider = 'microsoft365'
WHERE provider = 'm365';

-- The productivity agent is read-only and may use a provider connection only
-- where the capability has an actual synchronized work-item adapter.
INSERT INTO public.agent_integration_bindings
  (tenant_id, agent_key, integration_id, capability_id, enabled, policy, is_mock)
SELECT i.tenant_id,
       'agent-productivity',
       i.id,
       c.id,
       true,
       '{"default_window":"month","max_report_rows":100,"approval_mode":"read_only"}'::jsonb,
       COALESCE(i.is_mock, false)
FROM public.integrations i
JOIN public.provider_capabilities pc
  ON pc.provider = i.provider
 AND pc.implemented = true
JOIN public.capabilities c
  ON c.id = pc.capability_id
 AND c.capability_key = 'productivity_activity'
WHERE i.status = 'connected'
ON CONFLICT (tenant_id, agent_key, integration_id, capability_id) DO NOTHING;
