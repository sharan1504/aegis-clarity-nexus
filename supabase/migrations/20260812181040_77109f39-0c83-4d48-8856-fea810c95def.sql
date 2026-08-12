CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_tenant_member(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.tenant_id = _tenant_id
  );
$$;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_tenant_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_tenant_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- audit_log
DROP POLICY IF EXISTS "Tenant members can view audit log" ON public.audit_log;
CREATE POLICY "Tenant members can view audit log" ON public.audit_log FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Tenant members can append audit entries" ON public.audit_log;
CREATE POLICY "Tenant members can append audit entries" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id));

-- change_approvals
DROP POLICY IF EXISTS "Tenant members can view approvals" ON public.change_approvals;
CREATE POLICY "Tenant members can view approvals" ON public.change_approvals FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Tenant members can create approvals" ON public.change_approvals;
CREATE POLICY "Tenant members can create approvals" ON public.change_approvals FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Admins and managers can update approvals" ON public.change_approvals;
CREATE POLICY "Admins and managers can update approvals" ON public.change_approvals FOR UPDATE TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')))
  WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')));
DROP POLICY IF EXISTS "Tenant admins can delete approvals" ON public.change_approvals;
CREATE POLICY "Tenant admins can delete approvals" ON public.change_approvals FOR DELETE TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND app_private.has_role(auth.uid(),'admin'));

-- change_records
DROP POLICY IF EXISTS "Tenant members can view change records" ON public.change_records;
CREATE POLICY "Tenant members can view change records" ON public.change_records FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Tenant members can create change records" ON public.change_records;
CREATE POLICY "Tenant members can create change records" ON public.change_records FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Admins and managers can update change records" ON public.change_records;
CREATE POLICY "Admins and managers can update change records" ON public.change_records FOR UPDATE TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')))
  WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')));
DROP POLICY IF EXISTS "Tenant admins can delete change records" ON public.change_records;
CREATE POLICY "Tenant admins can delete change records" ON public.change_records FOR DELETE TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND app_private.has_role(auth.uid(),'admin'));

-- notifications
DROP POLICY IF EXISTS "Tenant members can view notifications" ON public.notifications;
CREATE POLICY "Tenant members can view notifications" ON public.notifications FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND (user_id IS NULL OR user_id = auth.uid()));
DROP POLICY IF EXISTS "Tenant members can create notifications" ON public.notifications;
CREATE POLICY "Tenant members can create notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Tenant members can update notifications" ON public.notifications;
CREATE POLICY "Tenant members can update notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (app_private.is_tenant_member(tenant_id)) WITH CHECK (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Tenant members can delete notifications" ON public.notifications;
CREATE POLICY "Tenant members can delete notifications" ON public.notifications FOR DELETE TO authenticated
  USING (app_private.is_tenant_member(tenant_id));

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR app_private.is_tenant_member(tenant_id));

-- reports
DROP POLICY IF EXISTS "Tenant members can view reports" ON public.reports;
CREATE POLICY "Tenant members can view reports" ON public.reports FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Admins and managers can create reports" ON public.reports;
CREATE POLICY "Admins and managers can create reports" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (app_private.is_tenant_member(tenant_id) AND (app_private.has_role(auth.uid(),'admin') OR app_private.has_role(auth.uid(),'manager')));
DROP POLICY IF EXISTS "Admins can delete reports" ON public.reports;
CREATE POLICY "Admins can delete reports" ON public.reports FOR DELETE TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND app_private.has_role(auth.uid(),'admin'));

-- tenants
DROP POLICY IF EXISTS "Members can view their tenant" ON public.tenants;
CREATE POLICY "Members can view their tenant" ON public.tenants FOR SELECT TO authenticated
  USING (app_private.is_tenant_member(id));
DROP POLICY IF EXISTS "Admins can update their tenant" ON public.tenants;
CREATE POLICY "Admins can update their tenant" ON public.tenants FOR UPDATE TO authenticated
  USING (app_private.is_tenant_member(id) AND app_private.has_role(auth.uid(),'admin'));

-- user_roles
DROP POLICY IF EXISTS "Users can view roles in their tenant" ON public.user_roles;
CREATE POLICY "Users can view roles in their tenant" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Bootstrap own role or admin assigns roles" ON public.user_roles;
CREATE POLICY "Bootstrap own role or admin assigns roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (app_private.is_tenant_member(tenant_id) AND app_private.has_role(auth.uid(),'admin')));
DROP POLICY IF EXISTS "Admins can update roles in tenant" ON public.user_roles;
CREATE POLICY "Admins can update roles in tenant" ON public.user_roles FOR UPDATE TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND app_private.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can delete roles in tenant" ON public.user_roles;
CREATE POLICY "Admins can delete roles in tenant" ON public.user_roles FOR DELETE TO authenticated
  USING (app_private.is_tenant_member(tenant_id) AND app_private.has_role(auth.uid(),'admin'));

-- storage.objects (report files)
DROP POLICY IF EXISTS "Tenant members can read their report files" ON storage.objects;
CREATE POLICY "Tenant members can read their report files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports' AND app_private.is_tenant_member((NULLIF(split_part(name, '/', 1), ''))::uuid));
DROP POLICY IF EXISTS "Tenant members can upload their report files" ON storage.objects;
CREATE POLICY "Tenant members can upload their report files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reports' AND app_private.is_tenant_member((NULLIF(split_part(name, '/', 1), ''))::uuid));
DROP POLICY IF EXISTS "Tenant members can delete their report files" ON storage.objects;
CREATE POLICY "Tenant members can delete their report files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'reports' AND app_private.is_tenant_member((NULLIF(split_part(name, '/', 1), ''))::uuid));

DROP FUNCTION IF EXISTS public.is_tenant_member(uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_log_seal() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.audit_log_force_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = v_uid;
  SELECT ur.role::text INTO v_role FROM public.user_roles ur
    WHERE ur.user_id = v_uid
    ORDER BY CASE ur.role::text
      WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'analyst' THEN 3 ELSE 4 END
    LIMIT 1;

  NEW.actor_id := v_uid;
  NEW.actor_email := COALESCE(v_email, NEW.actor_email);
  NEW.actor_role := COALESCE(v_role, 'viewer');

  IF NEW.action !~ '^[a-z0-9_]+\.[a-z0-9_.]+$' OR length(NEW.action) > 64 THEN
    RAISE EXCEPTION 'invalid audit action: %', NEW.action;
  END IF;
  IF NEW.entity_type NOT IN ('change_record','change_approval','report','notification','integration','user','tenant','agent','system') THEN
    RAISE EXCEPTION 'invalid audit entity_type: %', NEW.entity_type;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_log_force_actor() FROM PUBLIC;

DROP TRIGGER IF EXISTS audit_log_actor_before_insert ON public.audit_log;
CREATE TRIGGER audit_log_actor_before_insert
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_force_actor();