CREATE TABLE public.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 120),
  work_email text NOT NULL CHECK (char_length(trim(work_email)) BETWEEN 5 AND 320),
  company text NOT NULL CHECK (char_length(trim(company)) BETWEEN 2 AND 160),
  job_title text,
  use_case text NOT NULL CHECK (char_length(trim(use_case)) BETWEEN 20 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  requested_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.access_requests TO anon, authenticated;
GRANT SELECT, UPDATE ON public.access_requests TO authenticated;
GRANT ALL ON public.access_requests TO service_role;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can request access" ON public.access_requests FOR INSERT TO anon, authenticated WITH CHECK (
  status = 'pending' AND requested_tenant_id IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_notes IS NULL
);
CREATE POLICY "Tenant admins can view access requests" ON public.access_requests FOR SELECT TO authenticated USING (
  app_private.has_role(auth.uid(), 'admin'::public.app_role)
  AND (requested_tenant_id IS NULL OR app_private.is_tenant_member(requested_tenant_id))
);
CREATE POLICY "Tenant admins can review access requests" ON public.access_requests FOR UPDATE TO authenticated USING (
  app_private.has_role(auth.uid(), 'admin'::public.app_role)
  AND (requested_tenant_id IS NULL OR app_private.is_tenant_member(requested_tenant_id))
) WITH CHECK (
  app_private.has_role(auth.uid(), 'admin'::public.app_role)
  AND requested_tenant_id IS NOT NULL
  AND app_private.is_tenant_member(requested_tenant_id)
  AND reviewed_by = auth.uid()
);
CREATE TRIGGER update_access_requests_updated_at BEFORE UPDATE ON public.access_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX access_requests_status_created_idx ON public.access_requests(status, created_at DESC);
CREATE UNIQUE INDEX access_requests_pending_email_idx ON public.access_requests(lower(work_email)) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION app_private.prevent_profile_tenant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Tenant membership can only be changed by an administrator service';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.prevent_profile_tenant_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profiles_prevent_tenant_change ON public.profiles;
CREATE TRIGGER profiles_prevent_tenant_change BEFORE UPDATE OF tenant_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION app_private.prevent_profile_tenant_change();

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile fields"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND tenant_id IS NOT DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Bootstrap own role or admin assigns roles" ON public.user_roles;
CREATE POLICY "Admins assign roles to other members"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  user_id <> auth.uid()
  AND app_private.is_tenant_member(tenant_id)
  AND app_private.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.tenant_id = tenant_id)
);

CREATE OR REPLACE FUNCTION app_private.prevent_self_role_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NEW.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Users cannot assign or change their own role';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.prevent_self_role_assignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_roles_prevent_self_assignment ON public.user_roles;
CREATE TRIGGER user_roles_prevent_self_assignment BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION app_private.prevent_self_role_assignment();