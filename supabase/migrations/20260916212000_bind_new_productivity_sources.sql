-- Keep the read-only Productivity Agent binding in sync for newly connected
-- provider instances whose provider_capabilities row explicitly says the
-- capability is implemented.
CREATE OR REPLACE FUNCTION public.bind_productivity_integration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capability_id uuid;
BEGIN
  IF NEW.integration_id IS NULL OR NEW.status <> 'connected' THEN
    RETURN NEW;
  END IF;

  SELECT c.id
  INTO v_capability_id
  FROM public.capabilities c
  JOIN public.provider_capabilities pc
    ON pc.capability_id = c.id
  WHERE c.capability_key = 'productivity_activity'
    AND pc.provider = CASE WHEN NEW.provider = 'm365' THEN 'microsoft365' ELSE NEW.provider END
    AND pc.implemented = true
  LIMIT 1;

  IF v_capability_id IS NOT NULL THEN
    INSERT INTO public.agent_integration_bindings
      (tenant_id, agent_key, integration_id, capability_id, enabled, policy, is_mock)
    VALUES (
      NEW.tenant_id,
      'agent-productivity',
      NEW.integration_id,
      v_capability_id,
      true,
      '{"default_window":"month","max_report_rows":100,"approval_mode":"read_only"}'::jsonb,
      false
    )
    ON CONFLICT (tenant_id, agent_key, integration_id, capability_id) DO UPDATE
      SET enabled = true,
          is_mock = EXCLUDED.is_mock,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_connection_productivity_binding ON public.provider_connections;
CREATE TRIGGER provider_connection_productivity_binding
AFTER INSERT OR UPDATE OF status, integration_id, provider
ON public.provider_connections
FOR EACH ROW
EXECUTE FUNCTION public.bind_productivity_integration();
