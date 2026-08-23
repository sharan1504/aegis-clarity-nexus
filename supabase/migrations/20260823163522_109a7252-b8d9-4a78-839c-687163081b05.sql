-- 1. Move tenant helpers out of the API-exposed public schema.
CREATE OR REPLACE FUNCTION app_private.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT tenant_id FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION app_private.has_tenant_role(_tenant_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = _tenant_id AND ur.role::text = _role) $$;

REVOKE ALL ON FUNCTION app_private.current_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.has_tenant_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.current_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_tenant_role(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS webhooks_admin_select ON public.webhooks;
DROP POLICY IF EXISTS webhooks_admin_insert ON public.webhooks;
DROP POLICY IF EXISTS webhooks_admin_update ON public.webhooks;
DROP POLICY IF EXISTS webhooks_admin_delete ON public.webhooks;
CREATE POLICY webhooks_admin_select ON public.webhooks FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY webhooks_admin_insert ON public.webhooks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY webhooks_admin_update ON public.webhooks FOR UPDATE TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY webhooks_admin_delete ON public.webhooks FOR DELETE TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

DROP POLICY IF EXISTS webhook_attempts_admin_select ON public.webhook_delivery_attempts;
CREATE POLICY webhook_attempts_admin_select ON public.webhook_delivery_attempts FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

DROP POLICY IF EXISTS webhook_outbox_admin_select ON public.webhook_outbox;
CREATE POLICY webhook_outbox_admin_select ON public.webhook_outbox FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id() AND app_private.has_tenant_role(tenant_id, 'admin'));

DROP POLICY IF EXISTS provider_sync_entities_tenant_select ON public.provider_sync_entities;
CREATE POLICY provider_sync_entities_tenant_select ON public.provider_sync_entities FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id());

DROP POLICY IF EXISTS provider_sync_runs_tenant_select ON public.provider_sync_runs;
CREATE POLICY provider_sync_runs_tenant_select ON public.provider_sync_runs FOR SELECT TO authenticated
  USING (tenant_id = app_private.current_tenant_id());

DROP FUNCTION IF EXISTS public.current_tenant_id();
DROP FUNCTION IF EXISTS public.has_tenant_role(uuid, text);
DROP FUNCTION IF EXISTS public.upsert_provider_connection(uuid,text,text,text,text,text,timestamptz,text);

-- 2. Trigger-only SECURITY DEFINER functions must not be API-callable.
REVOKE ALL ON FUNCTION public.audit_guardrail_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_audit_webhooks() FROM PUBLIC, anon, authenticated;

-- 3. profiles: tenant_id may only be set once, into an empty (just-created)
-- workspace or one the user has already been granted a role in.
CREATE OR REPLACE FUNCTION app_private.can_join_tenant(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = _tenant_id)
    OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.tenant_id = _tenant_id)
  )
$$;
REVOKE ALL ON FUNCTION app_private.can_join_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.can_join_tenant(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.profiles_guard_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- Service-role / trigger contexts have no auth.uid() and are trusted.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NOT NULL AND NOT app_private.can_join_tenant(NEW.tenant_id) THEN
      RAISE EXCEPTION 'not authorized to join that workspace';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    IF OLD.tenant_id IS NOT NULL THEN
      RAISE EXCEPTION 'workspace membership cannot be changed';
    END IF;
    IF NEW.tenant_id IS NULL OR NOT app_private.can_join_tenant(NEW.tenant_id) THEN
      RAISE EXCEPTION 'not authorized to join that workspace';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.profiles_guard_tenant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_guard_tenant_trg ON public.profiles;
CREATE TRIGGER profiles_guard_tenant_trg BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION app_private.profiles_guard_tenant();

-- 4. user_roles: self-insert only during genuine first-time bootstrap.
CREATE OR REPLACE FUNCTION app_private.can_bootstrap_role(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.tenant_id = _tenant_id)
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.tenant_id = _tenant_id)
$$;
REVOKE ALL ON FUNCTION app_private.can_bootstrap_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.can_bootstrap_role(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Bootstrap own role or admin assigns roles" ON public.user_roles;
CREATE POLICY "Bootstrap own role or admin assigns roles" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  (app_private.is_tenant_member(tenant_id) AND app_private.has_role(auth.uid(), 'admin'))
  OR (user_id = auth.uid() AND app_private.can_bootstrap_role(tenant_id))
);