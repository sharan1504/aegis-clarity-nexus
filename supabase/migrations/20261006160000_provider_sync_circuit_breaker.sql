-- Provider sync circuit breaker state.
-- Keep connection status as the configured credential state; degraded is health, not disconnection.
ALTER TABLE public.provider_connections
  DROP CONSTRAINT IF EXISTS provider_connections_health_status_check;
ALTER TABLE public.provider_connections
  ADD CONSTRAINT provider_connections_health_status_check
  CHECK (health_status IN ('healthy','unhealthy','degraded','unknown'));
