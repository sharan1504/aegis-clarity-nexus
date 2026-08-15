-- 1. Snapshot versioning + lifecycle on sync runs
ALTER TABLE public.integration_sync_runs
  ADD COLUMN IF NOT EXISTS snapshot_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS validation_status text,
  ADD COLUMN IF NOT EXISTS validation_detail text,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS integration_sync_runs_snapshot_id_key
  ON public.integration_sync_runs (snapshot_id);

CREATE INDEX IF NOT EXISTS integration_sync_runs_integration_started_idx
  ON public.integration_sync_runs (integration_id, started_at DESC);

CREATE INDEX IF NOT EXISTS integration_sync_runs_promoted_idx
  ON public.integration_sync_runs (integration_id, promoted_at DESC);

-- 2. Snapshot + lifecycle columns on every Genesys data table
ALTER TABLE public.genesys_users
  ADD COLUMN IF NOT EXISTS sync_id uuid,
  ADD COLUMN IF NOT EXISTS snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_sync_id uuid,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

ALTER TABLE public.genesys_licenses
  ADD COLUMN IF NOT EXISTS sync_id uuid,
  ADD COLUMN IF NOT EXISTS snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_sync_id uuid,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

ALTER TABLE public.genesys_user_licenses
  ADD COLUMN IF NOT EXISTS sync_id uuid,
  ADD COLUMN IF NOT EXISTS snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_sync_id uuid,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

ALTER TABLE public.genesys_queues
  ADD COLUMN IF NOT EXISTS sync_id uuid,
  ADD COLUMN IF NOT EXISTS snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_sync_id uuid,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

-- 3. Database-backed sync lock on the integration (auto-expiring)
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS sync_lock_run_id uuid,
  ADD COLUMN IF NOT EXISTS sync_lock_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS active_snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS active_sync_run_id uuid;

-- 4. Workload indexes
CREATE INDEX IF NOT EXISTS integrations_tenant_provider_idx
  ON public.integrations (tenant_id, provider);

CREATE INDEX IF NOT EXISTS genesys_users_integration_user_idx
  ON public.genesys_users (integration_id, genesys_user_id);
CREATE INDEX IF NOT EXISTS genesys_users_integration_current_idx
  ON public.genesys_users (integration_id, is_current);
CREATE INDEX IF NOT EXISTS genesys_users_integration_last_seen_idx
  ON public.genesys_users (integration_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS genesys_users_tenant_current_idx
  ON public.genesys_users (tenant_id, is_current);

CREATE INDEX IF NOT EXISTS genesys_licenses_integration_license_idx
  ON public.genesys_licenses (integration_id, license_id);
CREATE INDEX IF NOT EXISTS genesys_licenses_integration_current_idx
  ON public.genesys_licenses (integration_id, is_current);

CREATE INDEX IF NOT EXISTS genesys_user_licenses_integration_user_idx
  ON public.genesys_user_licenses (integration_id, genesys_user_id);
CREATE INDEX IF NOT EXISTS genesys_user_licenses_integration_license_idx
  ON public.genesys_user_licenses (integration_id, license_id);
CREATE INDEX IF NOT EXISTS genesys_user_licenses_integration_current_idx
  ON public.genesys_user_licenses (integration_id, is_current);

CREATE INDEX IF NOT EXISTS genesys_queues_integration_queue_idx
  ON public.genesys_queues (integration_id, queue_id);
CREATE INDEX IF NOT EXISTS genesys_queues_integration_current_idx
  ON public.genesys_queues (integration_id, is_current);

-- 5. Backfill: existing rows are the current dataset
UPDATE public.genesys_users SET last_seen_at = COALESCE(synced_at, now()) WHERE last_seen_sync_id IS NULL;
UPDATE public.genesys_licenses SET last_seen_at = COALESCE(synced_at, now()) WHERE last_seen_sync_id IS NULL;
UPDATE public.genesys_user_licenses SET last_seen_at = COALESCE(synced_at, now()) WHERE last_seen_sync_id IS NULL;
UPDATE public.genesys_queues SET last_seen_at = COALESCE(synced_at, now()) WHERE last_seen_sync_id IS NULL;