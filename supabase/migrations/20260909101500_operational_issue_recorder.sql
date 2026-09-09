CREATE OR REPLACE FUNCTION public.record_operational_issue(
  p_tenant_id uuid,
  p_source public.operational_issue_source,
  p_severity public.operational_issue_severity,
  p_title text,
  p_detail text,
  p_related_id text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_id uuid;
  v_status public.operational_issue_status;
  v_should_notify boolean := false;
  v_now timestamptz := now();
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'Not authorized to record an operational issue for this tenant';
  END IF;
  v_key := p_source::text || ':' || COALESCE(NULLIF(trim(p_related_id), ''), md5(lower(trim(p_source::text || '|' || COALESCE(p_title, '') || '|' || COALESCE(p_detail, '') || '|' || COALESCE(p_fingerprint, '')))));
  SELECT id, status INTO v_id, v_status FROM public.operational_issues WHERE tenant_id = p_tenant_id AND dedupe_key = v_key FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO public.operational_issues (tenant_id, source, severity, title, detail, status, related_id, dedupe_key)
    VALUES (p_tenant_id, p_source, p_severity, left(trim(p_title), 300), left(trim(p_detail), 10000), 'open', p_related_id, v_key)
    RETURNING id INTO v_id;
    v_should_notify := p_severity IN ('critical', 'high');
  ELSE
    UPDATE public.operational_issues
    SET severity = p_severity, title = left(trim(p_title), 300), detail = left(trim(p_detail), 10000),
        status = CASE WHEN v_status = 'resolved' THEN 'open'::public.operational_issue_status ELSE v_status END,
        related_id = p_related_id, last_seen_at = v_now, occurrence_count = occurrence_count + 1,
        resolved_at = CASE WHEN v_status = 'resolved' THEN NULL ELSE resolved_at END,
        resolved_by = CASE WHEN v_status = 'resolved' THEN NULL ELSE resolved_by END
    WHERE id = v_id;
    v_should_notify := v_status = 'resolved' AND p_severity IN ('critical', 'high');
  END IF;
  IF v_should_notify THEN
    INSERT INTO public.notifications (tenant_id, user_id, kind, title, body, href)
    SELECT p_tenant_id, admin_users.user_id, 'operational_issue', upper(p_severity::text) || ': ' || left(trim(p_title), 250), left(trim(p_detail), 2000), '/operational-console?issue=' || v_id::text
    FROM (SELECT DISTINCT user_id FROM public.user_roles WHERE tenant_id = p_tenant_id AND role = 'admin') admin_users;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_operational_issue(uuid, public.operational_issue_source, public.operational_issue_severity, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_operational_issue(uuid, public.operational_issue_source, public.operational_issue_severity, text, text, text, text) TO authenticated, service_role;
