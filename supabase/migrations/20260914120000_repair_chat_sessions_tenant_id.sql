-- Repair chat persistence for Supabase environments where chat_sessions
-- was created before tenant_id was introduced.
-- This migration is intentionally idempotent and preserves existing chat rows.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Recover tenant ownership from the authenticated user's profile for any
-- existing sessions created before tenant_id existed.
UPDATE public.chat_sessions AS cs
SET tenant_id = p.tenant_id
FROM public.profiles AS p
WHERE cs.tenant_id IS NULL
  AND p.id = cs.user_id
  AND p.tenant_id IS NOT NULL;

-- Existing sessions must be tenant-scoped before enabling the FK/NOT NULL
-- contract expected by the application and RLS policies.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.chat_sessions
    WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot repair chat_sessions.tenant_id: one or more existing sessions have no tenant mapping';
  END IF;
END $$;

ALTER TABLE public.chat_sessions
  ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.chat_sessions'::regclass
      AND conname = 'chat_sessions_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.chat_sessions
      ADD CONSTRAINT chat_sessions_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chat_sessions_tenant_updated_idx
  ON public.chat_sessions(tenant_id, updated_at DESC);

-- Keep chat_messages tenant-scoped and consistent with sessions.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.chat_messages AS cm
SET tenant_id = cs.tenant_id
FROM public.chat_sessions AS cs
WHERE cm.tenant_id IS NULL
  AND cm.session_id = cs.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.chat_messages
    WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot repair chat_messages.tenant_id: one or more existing messages have no session tenant mapping';
  END IF;
END $$;

ALTER TABLE public.chat_messages
  ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.chat_messages'::regclass
      AND conname = 'chat_messages_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chat_messages_tenant_created_idx
  ON public.chat_messages(tenant_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
