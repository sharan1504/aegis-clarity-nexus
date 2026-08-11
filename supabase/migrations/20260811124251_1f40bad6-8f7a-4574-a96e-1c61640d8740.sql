-- ============ enums ============
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'analyst', 'viewer');

-- ============ tenants ============
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_tenant_id_idx ON public.profiles(tenant_id);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ user_roles ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);
CREATE INDEX user_roles_user_idx ON public.user_roles(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ helper functions (security definer, no recursion) ============
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND tenant_id = _tenant_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id AND p.tenant_id = ur.tenant_id
    WHERE ur.user_id = _user_id AND ur.role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- tenants / profiles / user_roles policies
CREATE POLICY "Members can view their tenant"
  ON public.tenants FOR SELECT TO authenticated
  USING (public.is_tenant_member(id));
CREATE POLICY "Authenticated users can create a tenant"
  ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Admins can update their tenant"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_tenant_member(id) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_tenant_member(tenant_id));
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Users can view roles in their tenant"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tenant_member(tenant_id));
CREATE POLICY "Bootstrap own role or admin assigns roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (public.is_tenant_member(tenant_id) AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "Admins can update roles in tenant"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id) AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles in tenant"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_tenant_member(tenant_id) AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ change_records ============
CREATE TABLE public.change_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  change_id text NOT NULL,
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'Proposed',
  severity text NOT NULL DEFAULT 'medium',
  risk jsonb NOT NULL DEFAULT '{"tier":"Low","score":0,"factors":[]}'::jsonb,
  execution_mode text NOT NULL DEFAULT 'Manual',
  owner_team text NOT NULL,
  requester text,
  category text,
  agent text,
  change_window jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_impact text,
  ai_reasoning text,
  rollback_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  validations jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_tickets jsonb NOT NULL DEFAULT '[]'::jsonb,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, change_id)
);
CREATE INDEX change_records_tenant_idx ON public.change_records(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_records TO authenticated;
GRANT ALL ON public.change_records TO service_role;
ALTER TABLE public.change_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view change records"
  ON public.change_records FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members can create change records"
  ON public.change_records FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members can update change records"
  ON public.change_records FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant admins can delete change records"
  ON public.change_records FOR DELETE TO authenticated
  USING (public.is_tenant_member(tenant_id) AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER change_records_updated_at BEFORE UPDATE ON public.change_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ change_approvals ============
CREATE TABLE public.change_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  change_record_id uuid NOT NULL REFERENCES public.change_records(id) ON DELETE CASCADE,
  team text NOT NULL,
  approver text NOT NULL,
  approver_role text,
  status text NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  comment text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_approvals_record_idx ON public.change_approvals(change_record_id);
CREATE INDEX change_approvals_tenant_idx ON public.change_approvals(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_approvals TO authenticated;
GRANT ALL ON public.change_approvals TO service_role;
ALTER TABLE public.change_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view approvals"
  ON public.change_approvals FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members can create approvals"
  ON public.change_approvals FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "Approvers can update approvals"
  ON public.change_approvals FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant admins can delete approvals"
  ON public.change_approvals FOR DELETE TO authenticated
  USING (public.is_tenant_member(tenant_id) AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER change_approvals_updated_at BEFORE UPDATE ON public.change_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ notifications ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  href text,
  unread boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_tenant_idx ON public.notifications(tenant_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY "Tenant members can create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members can update notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members can delete notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- ============ reports ============
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  dataset text NOT NULL,
  format text NOT NULL,
  storage_path text NOT NULL,
  size_bytes int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_tenant_idx ON public.reports(tenant_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view reports"
  ON public.reports FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members can create reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members can delete reports"
  ON public.reports FOR DELETE TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- ============ audit_log (append-only, hash chained) ============
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  detail text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash text,
  hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_tenant_idx ON public.audit_log(tenant_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members can append audit entries"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
-- no UPDATE/DELETE policies: entries are immutable

CREATE OR REPLACE FUNCTION public.audit_log_seal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_hash text;
BEGIN
  SELECT hash INTO last_hash
  FROM public.audit_log
  WHERE tenant_id = NEW.tenant_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  NEW.created_at = now();
  NEW.prev_hash = last_hash;
  NEW.actor_id = COALESCE(auth.uid(), NEW.actor_id);
  NEW.hash = encode(
    digest(
      COALESCE(last_hash, 'genesis') || '|' || NEW.tenant_id::text || '|' ||
      COALESCE(NEW.actor_id::text, 'system') || '|' || NEW.action || '|' ||
      NEW.entity_type || '|' || COALESCE(NEW.entity_id, '') || '|' ||
      NEW.payload::text || '|' || NEW.created_at::text,
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_seal_before_insert BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_seal();

CREATE OR REPLACE FUNCTION public.audit_log_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log entries are immutable';
END;
$$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutation();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutation();

-- ============ realtime ============
ALTER TABLE public.change_records REPLICA IDENTITY FULL;
ALTER TABLE public.change_approvals REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.change_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.change_approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;