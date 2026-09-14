-- Repair existing deployments where chat_messages already existed without result.
-- Keep this migration additive and safe for databases that already have the column.
alter table public.chat_messages
  add column if not exists result jsonb null;

create index if not exists chat_messages_session_created_idx
  on public.chat_messages(session_id, created_at asc);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages(user_id, created_at desc);

-- Refresh PostgREST so the newly added column is immediately visible to the API.
notify pgrst, 'reload schema';
