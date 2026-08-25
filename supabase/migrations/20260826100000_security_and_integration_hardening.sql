-- Security and integration hardening based on the repository security audit.
-- This migration closes the empty-workspace bootstrap race and repairs policies
-- that referenced tenant helpers moved from public to app_private.

-- 1. Bind a newly-created workspace to the authenticated creator. Existing
-- workspaces remain valid with a NULL creator because they predate this control.
alter table public.tenants
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.tenants
  alter column created_by set default auth.uid();

create index if not exists tenants_created_by_idx on public.tenants(created_by);

-- Safely recover a legacy empty workspace only when exactly one profile points
-- at it and there are no roles. That is the unambiguous first-user state and
-- does not allow one user to claim another user's workspace.
update public.tenants t
set created_by = p.id
from public.profiles p
where t.created_by is null
  and p.tenant_id = t.id
  and not exists (select 1 from public.user_roles ur where ur.tenant_id = t.id)
  and 1 = (
    select count(*)
    from public.profiles p2
    where p2.tenant_id = t.id
  );

-- A client must never be able to rewrite workspace ownership metadata.
create or replace function app_private.prevent_tenant_creator_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and new.created_by is distinct from old.created_by then
    raise exception 'workspace creator cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function app_private.prevent_tenant_creator_change() from public, anon, authenticated;

drop trigger if exists tenants_creator_immutable_trg on public.tenants;
create trigger tenants_creator_immutable_trg
before update on public.tenants
for each row execute function app_private.prevent_tenant_creator_change();

-- 2. An authenticated user may join an existing workspace only if they already
-- have membership there, or they are the creator of a newly-created workspace
-- that has not received its first role yet. This removes the arbitrary-empty-
-- tenant claim path.
create or replace function app_private.can_join_tenant(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.tenant_id = _tenant_id
    )
    or (
      exists (
        select 1
        from public.tenants t
        where t.id = _tenant_id
          and t.created_by = auth.uid()
      )
      and not exists (
        select 1 from public.user_roles ur where ur.tenant_id = _tenant_id
      )
    )
  )
$$;

revoke all on function app_private.can_join_tenant(uuid) from public, anon;
grant execute on function app_private.can_join_tenant(uuid) to authenticated, service_role;

-- 3. Keep tenant creation available for onboarding, but require the database
-- default to bind the new row to auth.uid(). A caller cannot select another
-- creator through the INSERT policy.
drop policy if exists "Authenticated users can create a tenant safely" on public.tenants;
drop policy if exists "Authenticated users can create a tenant" on public.tenants;
create policy "Authenticated users can create their own tenant"
on public.tenants for insert to authenticated
with check (created_by = auth.uid());

-- 4. First-user role bootstrap is allowed only for the creator of that fresh
-- workspace. That creator receives admin; ordinary self-bootstrap remains
-- viewer-only for an already-authorized workspace. Existing admins retain role
-- management within their tenant.
drop policy if exists "Users can bootstrap viewer role in current tenant" on public.user_roles;
drop policy if exists "Admins can grant roles to tenant members" on public.user_roles;
drop policy if exists "Bootstrap own role or admin assigns roles" on public.user_roles;

create policy "Workspace creator can bootstrap admin"
on public.user_roles for insert to authenticated
with check (
  user_id = auth.uid()
  and role = 'admin'
  and app_private.can_bootstrap_role(tenant_id)
  and exists (
    select 1 from public.tenants t
    where t.id = tenant_id
      and t.created_by = auth.uid()
  )
);

create policy "Users can bootstrap viewer role in current tenant"
on public.user_roles for insert to authenticated
with check (
  user_id = auth.uid()
  and tenant_id = app_private.current_tenant_id()
  and role = 'viewer'
);

create policy "Admins can grant roles to tenant members"
on public.user_roles for insert to authenticated
with check (
  app_private.has_tenant_role(tenant_id, 'admin')
  and exists (
    select 1 from public.profiles target
    where target.id = user_roles.user_id
      and target.tenant_id = tenant_id
  )
);

-- 5. Repair webhook policies. The previous migration created these policies
-- against public.current_tenant_id(), but that helper was deliberately moved to
-- app_private. Keep the secure helper and avoid restoring the public function.
drop policy if exists webhooks_admin_select on public.webhooks;
drop policy if exists webhooks_admin_insert on public.webhooks;
drop policy if exists webhooks_admin_update on public.webhooks;
drop policy if exists webhooks_admin_delete on public.webhooks;
drop policy if exists webhook_attempts_admin_select on public.webhook_delivery_attempts;
drop policy if exists webhook_outbox_admin_select on public.webhook_outbox;

create policy webhooks_admin_select on public.webhooks
for select to authenticated
using (
  tenant_id = app_private.current_tenant_id()
  and app_private.has_tenant_role(tenant_id, 'admin')
);

create policy webhooks_admin_insert on public.webhooks
for insert to authenticated
with check (
  tenant_id = app_private.current_tenant_id()
  and app_private.has_tenant_role(tenant_id, 'admin')
);

create policy webhooks_admin_update on public.webhooks
for update to authenticated
using (
  tenant_id = app_private.current_tenant_id()
  and app_private.has_tenant_role(tenant_id, 'admin')
)
with check (
  tenant_id = app_private.current_tenant_id()
  and app_private.has_tenant_role(tenant_id, 'admin')
);

create policy webhooks_admin_delete on public.webhooks
for delete to authenticated
using (
  tenant_id = app_private.current_tenant_id()
  and app_private.has_tenant_role(tenant_id, 'admin')
);

create policy webhook_attempts_admin_select on public.webhook_delivery_attempts
for select to authenticated
using (
  tenant_id = app_private.current_tenant_id()
  and app_private.has_tenant_role(tenant_id, 'admin')
);

create policy webhook_outbox_admin_select on public.webhook_outbox
for select to authenticated
using (
  tenant_id = app_private.current_tenant_id()
  and app_private.has_tenant_role(tenant_id, 'admin')
);

notify pgrst, 'reload schema';
