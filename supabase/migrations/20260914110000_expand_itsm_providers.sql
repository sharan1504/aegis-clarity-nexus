ALTER TABLE public.itsm_routing_config
  DROP CONSTRAINT IF EXISTS itsm_routing_config_provider_check;

ALTER TABLE public.itsm_routing_config
  ADD CONSTRAINT itsm_routing_config_provider_check
  CHECK (provider IN ('jira', 'servicenow', 'freshservice', 'manageengine'));

COMMENT ON COLUMN public.itsm_routing_config.provider IS 'ITSM provider: jira, servicenow, freshservice, or manageengine.';
