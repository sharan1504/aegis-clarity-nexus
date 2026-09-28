-- Organization Settings control plane: tenant-scoped divisions, groups, user division roles and privacy defaults.
-- Existing department tables are retained for runtime compatibility; the product surface calls them Divisions.

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.departments'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%department_key%'
  LOOP
    EXECUTE format('ALTER TABLE public.departments DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

-- Convert the original shared catalogue into tenant-owned divisions while preserving
-- existing memberships and agent access rows.
DO $$
DECLARE
  t record;
  d record;
  new_id uuid;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    FOR d IN SELECT id, department_key, display_name, description, active, scope FROM public.departments WHERE tenant_id IS NULL LOOP
      SELECT id INTO new_id
      FROM public.departments
      WHERE tenant_id = t.id AND department_key = d.department_key;
      IF new_id IS NULL THEN
        INSERT INTO public.departments (tenant_id, department_key, display_name, description, active, scope)
        VALUES (t.id, d.department_key, d.display_name, d.description, d.active, COALESCE(d.scope, '{}'::jsonb))
        RETURNING id INTO new_id;
      END IF;
      UPDATE public.user_department_memberships
        SET department_id = new_id
        WHERE tenant_id = t.id AND department_id = d.id;
      UPDATE public.department_agent_access
        SET department_id = new_id
        WHERE tenant_id = t.id AND department_id = d.id;
    END LOOP;
  END LOOP;
END $$;

DELETE FROM public.departments WHERE tenant_id IS NULL;
ALTER TABLE public.departments ALTER COLUMN tenant_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS departments_tenant_key_idx ON public.departments(tenant_id, department_key);
CREATE INDEX IF NOT EXISTS departments_tenant_parent_idx ON public.departments(tenant_id, parent_department_id);

ALTER TABLE public.user_department_memberships
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_department_memberships'::regclass
      AND conname = 'user_department_memberships_role_check'
  ) THEN
    ALTER TABLE public.user_department_memberships
      ADD CONSTRAINT user_department_memberships_role_check
      CHECK (role IN ('owner','admin','manager','member','viewer'));
  END IF;
END $;
CREATE INDEX IF NOT EXISTS user_department_memberships_department_idx
  ON public.user_department_memberships(tenant_id, department_id, user_id);

CREATE TABLE IF NOT EXISTS public.workspace_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, department_id, name)
);

CREATE TABLE IF NOT EXISTS public.workspace_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.workspace_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_role text NOT NULL DEFAULT 'member' CHECK (group_role IN ('owner','manager','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, group_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_groups_tenant_division_idx
  ON public.workspace_groups(tenant_id, department_id, active);
CREATE INDEX IF NOT EXISTS workspace_group_members_user_idx
  ON public.workspace_group_members(tenant_id, user_id, group_id);

-- Keep privacy/security preferences in the existing tenant analytics_settings JSON document
-- so this change does not introduce a second settings storage model.
UPDATE public.tenants
SET analytics_settings = jsonb_set(
  jsonb_set(
    COALESCE(analytics_settings, '{}'::jsonb),
    '{privacy}',
    COALESCE(analytics_settings->'privacy', '{"maskPii":true,"allowAiProviderData":true,"redactSecrets":true,"aiActivityRetentionDays":90}'::jsonb),
    true
  ),
  '{workspace}',
  COALESCE(analytics_settings->'workspace', '{"defaultLanguage":"en","weekStartsOn":"monday"}'::jsonb),
  true
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_department_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_group_members TO authenticated;
GRANT ALL ON public.departments, public.user_department_memberships, public.workspace_groups, public.workspace_group_members TO service_role;

ALTER TABLE public.workspace_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departments readable" ON public.departments;
DROP POLICY IF EXISTS "tenant members view divisions" ON public.departments;
CREATE POLICY "tenant members view divisions" ON public.departments
  FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND active = true);

DROP POLICY IF EXISTS "tenant admins manage divisions" ON public.departments;
CREATE POLICY "tenant admins manage divisions" ON public.departments
  FOR ALL TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

DROP POLICY IF EXISTS "users can view own department memberships" ON public.user_department_memberships;
CREATE POLICY "users can view own division memberships" ON public.user_department_memberships
  FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND (user_id = auth.uid() OR app_private.has_tenant_role(tenant_id, 'admin')));

DROP POLICY IF EXISTS "tenant admins manage department memberships" ON public.user_department_memberships;
CREATE POLICY "tenant admins manage division memberships" ON public.user_department_memberships
  FOR ALL TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

DROP POLICY IF EXISTS "tenant members view groups" ON public.workspace_groups;
CREATE POLICY "tenant members view groups" ON public.workspace_groups
  FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND active = true);
DROP POLICY IF EXISTS "tenant admins manage groups" ON public.workspace_groups;
CREATE POLICY "tenant admins manage groups" ON public.workspace_groups
  FOR ALL TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

DROP POLICY IF EXISTS "tenant members view group members" ON public.workspace_group_members;
CREATE POLICY "tenant members view group members" ON public.workspace_group_members
  FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id());
DROP POLICY IF EXISTS "tenant admins manage group members" ON public.workspace_group_members;
CREATE POLICY "tenant admins manage group members" ON public.workspace_group_members
  FOR ALL TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

COMMENT ON TABLE public.departments IS 'Tenant-scoped organizational divisions. Legacy runtime code may still call these departments.';
COMMENT ON TABLE public.workspace_groups IS 'Collaboration groups scoped to a tenant and division; groups do not bypass division access controls.';

-- Ensure PostgREST sees the newly created control-plane tables immediately after migration.
NOTIFY pgrst, 'reload schema';
