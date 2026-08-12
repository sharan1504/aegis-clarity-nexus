-- Create a default tenant and make the first (only) signed-up user its admin
DO $$
DECLARE t_id uuid; u_id uuid;
BEGIN
  SELECT id INTO t_id FROM public.tenants WHERE slug = 'aegis-hq';
  IF t_id IS NULL THEN
    INSERT INTO public.tenants (name, slug) VALUES ('Aegis HQ', 'aegis-hq') RETURNING id INTO t_id;
  END IF;

  FOR u_id IN SELECT id FROM auth.users LOOP
    UPDATE public.profiles SET tenant_id = t_id WHERE id = u_id AND tenant_id IS NULL;
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (u_id, t_id, 'admin')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;