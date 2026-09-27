-- Persist demo chat history across server instances without reseeding deleted conversations.
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS demo_seed_key text;

CREATE TABLE IF NOT EXISTS public.demo_chat_seed_state (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seed_version text NOT NULL,
  seeded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, seed_version)
);

ALTER TABLE public.demo_chat_seed_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demo_chat_seed_state_select ON public.demo_chat_seed_state;
CREATE POLICY demo_chat_seed_state_select
  ON public.demo_chat_seed_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS demo_chat_seed_state_insert ON public.demo_chat_seed_state;
CREATE POLICY demo_chat_seed_state_insert
  ON public.demo_chat_seed_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_tenant_member(tenant_id));

CREATE UNIQUE INDEX IF NOT EXISTS chat_sessions_demo_seed_unique_idx
  ON public.chat_sessions(tenant_id, user_id, demo_seed_key)
  WHERE demo_seed_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_sessions_demo_seed_idx
  ON public.chat_sessions(tenant_id, user_id, demo_seed_key)
  WHERE demo_seed_key IS NOT NULL;

NOTIFY pgrst, 'reload schema';
