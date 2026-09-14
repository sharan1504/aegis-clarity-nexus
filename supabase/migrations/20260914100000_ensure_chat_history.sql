-- Ensure the Copilot persistence tables exist even when the original chat-history migration
-- was not applied to an existing Supabase environment.
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  department_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_sessions add column if not exists department_key text;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  result jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_updated_idx on public.chat_sessions(user_id, updated_at desc);
create index if not exists chat_sessions_tenant_updated_idx on public.chat_sessions(tenant_id, updated_at desc);
create index if not exists chat_messages_session_created_idx on public.chat_messages(session_id, created_at asc);
create index if not exists chat_messages_user_created_idx on public.chat_messages(user_id, created_at desc);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_sessions' AND policyname = 'users can read their own chat sessions') THEN
    CREATE POLICY "users can read their own chat sessions" ON public.chat_sessions FOR SELECT USING (user_id = auth.uid() AND public.is_tenant_member(tenant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_sessions' AND policyname = 'users can create their own chat sessions') THEN
    CREATE POLICY "users can create their own chat sessions" ON public.chat_sessions FOR INSERT WITH CHECK (user_id = auth.uid() AND public.is_tenant_member(tenant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_sessions' AND policyname = 'users can update their own chat sessions') THEN
    CREATE POLICY "users can update their own chat sessions" ON public.chat_sessions FOR UPDATE USING (user_id = auth.uid() AND public.is_tenant_member(tenant_id)) WITH CHECK (user_id = auth.uid() AND public.is_tenant_member(tenant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_sessions' AND policyname = 'users can delete their own chat sessions') THEN
    CREATE POLICY "users can delete their own chat sessions" ON public.chat_sessions FOR DELETE USING (user_id = auth.uid() AND public.is_tenant_member(tenant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'users can read their own chat messages') THEN
    CREATE POLICY "users can read their own chat messages" ON public.chat_messages FOR SELECT USING (user_id = auth.uid() AND public.is_tenant_member(tenant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'users can create their own chat messages') THEN
    CREATE POLICY "users can create their own chat messages" ON public.chat_messages FOR INSERT WITH CHECK (user_id = auth.uid() AND public.is_tenant_member(tenant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'users can delete their own chat messages') THEN
    CREATE POLICY "users can delete their own chat messages" ON public.chat_messages FOR DELETE USING (user_id = auth.uid() AND public.is_tenant_member(tenant_id));
  END IF;
END $$;

-- Ask PostgREST to refresh its schema cache immediately after the migration.
NOTIFY pgrst, 'reload schema';