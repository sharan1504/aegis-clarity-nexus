-- Tenant- and user-scoped chat history. Messages are retained until the user explicitly deletes a session.
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create policy "users can read their own chat sessions"
on public.chat_sessions for select
using (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create policy "users can create their own chat sessions"
on public.chat_sessions for insert
with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create policy "users can update their own chat sessions"
on public.chat_sessions for update
using (user_id = auth.uid() and public.is_tenant_member(tenant_id))
with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create policy "users can delete their own chat sessions"
on public.chat_sessions for delete
using (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create policy "users can read their own chat messages"
on public.chat_messages for select
using (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create policy "users can create their own chat messages"
on public.chat_messages for insert
with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create policy "users can delete their own chat messages"
on public.chat_messages for delete
using (user_id = auth.uid() and public.is_tenant_member(tenant_id));
