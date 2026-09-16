CREATE TYPE public.operational_issue_source AS ENUM (
  'sync', 'agent_run', 'integration_health', 'guardrail_evaluation',
  'webhook_delivery', 'command_center', 'other'
);

CREATE TYPE public.operational_issue_severity AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE public.operational_issue_status AS ENUM ('open', 'acknowledged', 'resolved');

CREATE TABLE public.operational_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source public.operational_issue_source NOT NULL,
  severity public.operational_issue_severity NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  status public.operational_issue_status NOT NULL DEFAULT 'open',
  related_id text,
  dedupe_key text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dedupe_key),
  CHECK ((status = 'resolved' AND resolved_at IS NOT NULL) OR status <> 'resolved')
);

CREATE INDEX operational_issues_tenant_status_idx ON public.operational_issues(tenant_id, status, severity, last_seen_at DESC);
CREATE INDEX operational_issues_tenant_last_seen_idx ON public.operational_issues(tenant_id, last_seen_at DESC);
CREATE INDEX operational_issues_related_idx ON public.operational_issues(tenant_id, related_id);

GRANT SELECT, INSERT, UPDATE ON public.operational_issues TO authenticated;
GRANT ALL ON public.operational_issues TO service_role;
ALTER TABLE public.operational_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view operational issues"
  ON public.operational_issues FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members can create operational issues"
  ON public.operational_issues FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members can update operational issues"
  ON public.operational_issues FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TRIGGER operational_issues_updated_at BEFORE UPDATE ON public.operational_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.operational_issues IS 'Current platform/integration/agent health issues requiring attention; distinct from audit history and security findings.';
COMMENT ON COLUMN public.operational_issues.dedupe_key IS 'Stable tenant-local fingerprint used to coalesce repeated occurrences into one operational issue.';
