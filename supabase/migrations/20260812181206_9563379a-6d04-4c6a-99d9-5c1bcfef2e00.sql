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
  IF NEW.entity_type NOT IN ('change_record','change_approval','approval','report','ticket','notification','integration','user','tenant','agent','system') THEN
    RAISE EXCEPTION 'invalid audit entity_type: %', NEW.entity_type;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_log_force_actor() FROM anon, authenticated, PUBLIC;