-- Personal tenant-scoped dashboards. Configuration stores only presentation choices; operational data remains sourced from existing evidence tables.
create table if not exists public.custom_dashboards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  starred boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists custom_dashboards_user_updated_idx on public.custom_dashboards(user_id, updated_at desc);
create index if not exists custom_dashboards_tenant_updated_idx on public.custom_dashboards(tenant_id, updated_at desc);
alter table public.custom_dashboards enable row level security;
create policy "users can read their own custom dashboards" on public.custom_dashboards for select using (user_id = auth.uid() and public.is_tenant_member(tenant_id));
create policy "users can create their own custom dashboards" on public.custom_dashboards for insert with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));
create policy "users can update their own custom dashboards" on public.custom_dashboards for update using (user_id = auth.uid() and public.is_tenant_member(tenant_id)) with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));
create policy "users can delete their own custom dashboards" on public.custom_dashboards for delete using (user_id = auth.uid() and public.is_tenant_member(tenant_id));
