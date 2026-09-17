import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, Plug, Plus, Search, ShieldCheck, XCircle } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { pageHead } from "@/lib/seo";
import { connectProvider, getProviderCatalog, prepareAwsConnection, removeProviderIntegration } from "@/lib/integrations/provider-functions";
import { deleteGenesysIntegration, startGenesysOAuth } from "@/lib/integrations-genesys.functions";
import { startGitHubAppInstall } from "@/lib/integrations/github-app.functions";
import { startJiraOAuth, startSalesforceOAuth, startServiceNowOAuth, startSlackOAuth, startHubSpotOAuth, startZendeskOAuth, startGitLabOAuth, startFreshworksOAuth, startZohoOAuth, startConfluenceOAuth, startSnowflakeOAuth, startCrowdStrikeOAuth, startGoogleCloudConnection, startGoogleWorkspaceConnection } from "@/lib/integrations/oauth-provider.functions";
import { startSapOAuth } from "@/lib/integrations/sap.functions";
import { startCohesityConnection, startDatadogConnection, startDefenderConnection, startMongoDbConnection, startNewRelicConnection, startOktaConnection, startOracleConnection, startPagerDutyConnection, startRubrikConnection, startSplunkConnection, startVeeamConnection, startWorkdayConnection } from "@/lib/integrations/provider-credential.functions";
import { DEFAULT_GENESYS_REGION, GENESYS_REGIONS } from "@/lib/genesys/errors";

export const Route = createFileRoute("/_app/integrations")({
  head: () => pageHead({ path: "/integrations", title: "Integrations — CenOps", description: "Manage enterprise integration instances and their health." }),
  component: IntegrationsPage,
});

type Catalog = Awaited<ReturnType<typeof getProviderCatalog>>;
type Provider = Catalog["providers"][number];
type Connection = Catalog["connections"][number];
type FormState = Record<string, string | undefined> & { integrationId?: string; provider: string; displayName: string; environment: string };

const EMPTY: FormState = {
  provider: "", displayName: "", environment: "Production", clientId: "", clientSecret: "", baseUrl: "", accessToken: "", apiKey: "", appKey: "", apiToken: "", region: DEFAULT_GENESYS_REGION,
  roleArn: "", externalId: "", trustPolicy: "", tenant: "", tenantAlias: "", customerTenantId: "", projectId: "", clientEmail: "", privateKey: "", delegatedAdminEmail: "",
  accountsUrl: "https://accounts.zoho.com", orgUrl: "", subdomain: "", accessTokenUri: "", identityDomainUrl: "", scope: "", accountUrl: "", username: "", password: "", token: "", site: "datadoghq.com", authorizationUrl: "", tokenUrl: "",
};

function ProviderLogo({ provider }: { provider: Provider }) {
  const [failed, setFailed] = useState(false);
  return <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background p-1.5">{!failed ? <img src={provider.logoUrl} alt="" className="h-full w-full object-contain" loading="lazy" onError={() => setFailed(true)} /> : <span className="text-sm font-semibold text-muted-foreground">{provider.name.slice(0, 1)}</span>}</div>;
}

function statusBadge(status: string) {
  if (status === "connected") return <Badge variant="outline" className="border-success/30 bg-success/10 text-success"><CheckCircle2 className="mr-1 h-3 w-3" />Connected</Badge>;
  if (status === "failed") return <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive"><XCircle className="mr-1 h-3 w-3" />Action required</Badge>;
  return <Badge variant="outline"><Plug className="mr-1 h-3 w-3" />Disconnected</Badge>;
}

function relative(iso: string | null) {
  if (!iso) return "Never";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value?: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <div><label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label><Input type={type} value={value ?? ""} placeholder={placeholder ?? label} onChange={(e) => onChange(e.target.value)} autoComplete={type === "password" ? "new-password" : "off"} /></div>;
}

function ProviderForm({ target, form, set }: { target: Provider; form: FormState; set: (key: string, value: string) => void }) {
  const id = target.id;
  if (id === "github") return <div className="rounded-md border p-3 text-sm">CenOps will open GitHub to install the App and select repositories. No GitHub token is entered here.</div>;
  if (id === "genesys") return <div className="space-y-3 rounded-md border p-3"><Field label="Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /><select value={form.region || DEFAULT_GENESYS_REGION} onChange={(e) => set("region", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{GENESYS_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.id}</option>)}</select></div>;
  if (id === "aws") return <div className="space-y-3 rounded-md border p-3"><Field label="AWS Role ARN" value={form.roleArn} onChange={(v) => set("roleArn", v)} /><div className="rounded-md bg-muted/40 p-3 text-xs"><b>External ID</b><div className="mt-1 break-all font-mono">{form.externalId || "Click Connect & verify to generate one."}</div></div>{form.trustPolicy && <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{form.trustPolicy}</pre>}</div>;
  if (["jira", "salesforce", "slack", "servicenow"].includes(id)) return <div className="space-y-3 rounded-md border p-3">{id === "servicenow" && <Field label="ServiceNow instance URL" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} placeholder="https://yourinstance.service-now.com" />}<Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "gcp") return <div className="space-y-3"><Field label="Service account email" value={form.clientEmail} onChange={(v) => set("clientEmail", v)} /><Field label="Project ID" value={form.projectId} onChange={(v) => set("projectId", v)} /><Field label="Service account private key" type="password" value={form.privateKey} onChange={(v) => set("privateKey", v)} /></div>;
  if (id === "google-workspace") return <div className="space-y-3"><Field label="Service account email" value={form.clientEmail} onChange={(v) => set("clientEmail", v)} /><Field label="Delegated admin email" value={form.delegatedAdminEmail} onChange={(v) => set("delegatedAdminEmail", v)} /><Field label="Service account private key" type="password" value={form.privateKey} onChange={(v) => set("privateKey", v)} /></div>;
  if (id === "freshworks") return <div className="space-y-3"><Field label="Freshservice organization URL" value={form.orgUrl} onChange={(v) => set("orgUrl", v)} placeholder="https://your-org.freshservice.com" /><Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "zendesk") return <div className="space-y-3"><Field label="Zendesk subdomain" value={form.subdomain} onChange={(v) => set("subdomain", v)} placeholder="acme" /><Field label="Global OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "zoho") return <div className="space-y-3"><Field label="Zoho Accounts URL" value={form.accountsUrl} onChange={(v) => set("accountsUrl", v)} /><Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (["hubspot", "confluence"].includes(id)) return <div className="space-y-3"><Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "gitlab") return <div className="space-y-3"><Field label="GitLab instance URL" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} placeholder="https://gitlab.com" /><Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "rubrik") return <div className="space-y-3"><Field label="Rubrik Security Cloud Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /><Field label="Access token URI" value={form.accessTokenUri} onChange={(v) => set("accessTokenUri", v)} placeholder="https://account.my.rubrik.com/api/client_token" /></div>;
  if (id === "veeam") return <div className="space-y-3"><Field label="Veeam Service Provider Console URL" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} /><Field label="Username" value={form.username} onChange={(v) => set("username", v)} /><Field label="Password" type="password" value={form.password} onChange={(v) => set("password", v)} /></div>;
  if (id === "cohesity") return <div className="space-y-3"><Field label="Cohesity API base URL" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} /><Field label="API Key" type="password" value={form.apiKey} onChange={(v) => set("apiKey", v)} /></div>;
  if (id === "crowdstrike") return <div className="space-y-3"><Field label="Falcon OAuth API base URL" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} /><Field label="Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "microsoft-defender") return <div className="space-y-3"><Field label="Microsoft Entra Tenant ID" value={form.customerTenantId} onChange={(v) => set("customerTenantId", v)} /><Field label="Application Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "okta") return <div className="space-y-3"><Field label="Okta org URL" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} placeholder="https://yourorg.okta.com" /><Field label="SSWS API Token" type="password" value={form.apiToken} onChange={(v) => set("apiToken", v)} /></div>;
  if (id === "datadog") return <div className="space-y-3"><Field label="Datadog site" value={form.site} onChange={(v) => set("site", v)} placeholder="datadoghq.com" /><Field label="API Key" type="password" value={form.apiKey} onChange={(v) => set("apiKey", v)} /><Field label="Application Key" type="password" value={form.appKey} onChange={(v) => set("appKey", v)} /></div>;
  if (id === "newrelic") return <div className="space-y-3"><select value={form.region || "us"} onChange={(e) => set("region", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="us">US</option><option value="eu">EU</option><option value="jp">Japan</option></select><Field label="New Relic User API Key" type="password" value={form.apiKey} onChange={(v) => set("apiKey", v)} /></div>;
  if (id === "splunk") return <div className="space-y-3"><Field label="Splunk REST API base URL" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} placeholder="https://host:8089" /><Field label="Bearer token" type="password" value={form.token} onChange={(v) => set("token", v)} /></div>;
  if (id === "pagerduty") return <Field label="PagerDuty REST API token" type="password" value={form.apiToken} onChange={(v) => set("apiToken", v)} />;
  if (id === "workday") return <div className="space-y-3"><select value={form.region || "us"} onChange={(e) => set("region", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="us">US</option><option value="usWcp">US WCP</option><option value="eu">EU</option><option value="sg">Singapore</option><option value="uk">UK</option></select><Field label="Workday tenant alias" value={form.tenantAlias} onChange={(v) => set("tenantAlias", v)} /><Field label="Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "sap") return <div className="space-y-3"><div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">SAP exposes OAuth 2.0 through product/tenant-specific authorization services. Enter the documented endpoints from your SAP BTP or SAP product service binding; CenOps does not guess them.</div><Field label="OAuth Authorization URL" value={form.authorizationUrl} onChange={(v) => set("authorizationUrl", v)} placeholder="https://…/oauth/authorize" /><Field label="OAuth Token URL" value={form.tokenUrl} onChange={(v) => set("tokenUrl", v)} placeholder="https://…/oauth/token" /><Field label="SAP API base URL (optional)" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} placeholder="https://…" /><Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /><Field label="OAuth scopes (optional)" value={form.scope} onChange={(v) => set("scope", v)} placeholder="scope1 scope2" /></div>;
  if (id === "oracle") return <div className="space-y-3"><Field label="Oracle Identity Domain URL" value={form.identityDomainUrl} onChange={(v) => set("identityDomainUrl", v)} /><Field label="Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /><Field label="OAuth scope" value={form.scope} onChange={(v) => set("scope", v)} /></div>;
  if (id === "snowflake") return <div className="space-y-3"><Field label="Snowflake account URL" value={form.accountUrl} onChange={(v) => set("accountUrl", v)} placeholder="https://account.region.snowflakecomputing.com" /><Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "mongodb") return <div className="space-y-3"><Field label="MongoDB Atlas Service Account Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (["m365", "azure"].includes(id)) return <div className="space-y-3"><Field label="Tenant ID" value={form.tenant} onChange={(v) => set("tenant", v)} /><Field label="Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  return <Field label="Access token" type="password" value={form.accessToken} onChange={(v) => set("accessToken", v)} />;
}

async function startProvider(target: Provider, form: FormState) {
  const redirectUri = `${window.location.origin}/integrations/${target.id}/callback`;
  const data: any = { connectionId: form.integrationId, displayName: form.displayName, environment: form.environment };
  switch (target.id) {
    case "jira": return startJiraOAuth({ data: { ...data, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "salesforce": return startSalesforceOAuth({ data: { ...data, clientId: form.clientId!, clientSecret: form.clientSecret || undefined, redirectUri } });
    case "servicenow": return startServiceNowOAuth({ data: { ...data, instanceUrl: form.baseUrl!, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "slack": return startSlackOAuth({ data: { ...data, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "hubspot": return startHubSpotOAuth({ data: { ...data, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "zendesk": return startZendeskOAuth({ data: { ...data, subdomain: form.subdomain!, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "gitlab": return startGitLabOAuth({ data: { ...data, instanceUrl: form.baseUrl!, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "freshworks": return startFreshworksOAuth({ data: { ...data, orgUrl: form.orgUrl!, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "zoho": return startZohoOAuth({ data: { ...data, accountsUrl: form.accountsUrl!, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "confluence": return startConfluenceOAuth({ data: { ...data, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "snowflake": return startSnowflakeOAuth({ data: { ...data, accountUrl: form.accountUrl!, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "workday": return startWorkdayConnection({ data: { ...data, region: form.region as any, tenantAlias: form.tenantAlias!, clientId: form.clientId!, clientSecret: form.clientSecret!, redirectUri } });
    case "sap": return startSapOAuth({ data: { ...data, authorizationUrl: form.authorizationUrl!, tokenUrl: form.tokenUrl!, apiBaseUrl: form.baseUrl || undefined, clientId: form.clientId!, clientSecret: form.clientSecret!, scope: form.scope || undefined, redirectUri } });
    case "gcp": return startGoogleCloudConnection({ data: { ...data, clientEmail: form.clientEmail!, privateKey: form.privateKey!, projectId: form.projectId! } });
    case "google-workspace": return startGoogleWorkspaceConnection({ data: { ...data, clientEmail: form.clientEmail!, privateKey: form.privateKey!, delegatedAdminEmail: form.delegatedAdminEmail! } });
    case "rubrik": return startRubrikConnection({ data: { ...data, clientId: form.clientId!, clientSecret: form.clientSecret!, accessTokenUri: form.accessTokenUri! } });
    case "veeam": return startVeeamConnection({ data: { ...data, baseUrl: form.baseUrl!, username: form.username!, password: form.password! } });
    case "cohesity": return startCohesityConnection({ data: { ...data, baseUrl: form.baseUrl!, apiKey: form.apiKey! } });
    case "crowdstrike": return startCrowdStrikeOAuth({ data: { ...data, clientId: form.clientId!, clientSecret: form.clientSecret!, apiBaseUrl: form.baseUrl! } });
    case "microsoft-defender": return startDefenderConnection({ data: { ...data, clientId: form.clientId!, clientSecret: form.clientSecret!, customerTenantId: form.customerTenantId } });
    case "okta": return startOktaConnection({ data: { ...data, baseUrl: form.baseUrl!, apiToken: form.apiToken! } });
    case "datadog": return startDatadogConnection({ data: { ...data, apiKey: form.apiKey!, appKey: form.appKey!, site: form.site } });
    case "newrelic": return startNewRelicConnection({ data: { ...data, apiKey: form.apiKey!, region: form.region as any } });
    case "splunk": return startSplunkConnection({ data: { ...data, baseUrl: form.baseUrl!, token: form.token! } });
    case "pagerduty": return startPagerDutyConnection({ data: { ...data, apiToken: form.apiToken! } });
    case "oracle": return startOracleConnection({ data: { ...data, identityDomainUrl: form.identityDomainUrl!, clientId: form.clientId!, clientSecret: form.clientSecret!, scope: form.scope! } });
    case "mongodb": return startMongoDbConnection({ data: { ...data, clientId: form.clientId!, clientSecret: form.clientSecret! } });
    case "genesys": return startGenesysOAuth({ data: { integrationId: form.integrationId, region: form.region || DEFAULT_GENESYS_REGION, redirectUri, clientId: form.clientId!, clientSecret: form.clientSecret!, displayName: form.displayName, environment: form.environment } });
    default: return connectProvider({ data: { ...form, provider: target.id as never } });
  }
}

function IntegrationsPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [target, setTarget] = useState<Provider | null>(null);
  const [selected, setSelected] = useState<Connection | null>(null);
  const [removeTargets, setRemoveTargets] = useState<Connection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<FormState>(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setCatalog(await getProviderCatalog()); } catch { setMessage("Unable to load integrations."); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const connections = catalog?.connections ?? [];
    const providers = catalog?.providers ?? [];
    const q = search.toLowerCase();
    return connections.filter((x) => {
      const p = providers.find((v) => v.id === x.provider);
      return (!q || [p?.name, x.display_name, x.external_id, x.environment].some((v) => String(v ?? "").toLowerCase().includes(q))) && (statusFilter === "all" || x.status === statusFilter);
    });
  }, [catalog, search, statusFilter]);

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const openAdd = () => {
    const p = catalog?.providers.find((x) => x.availability === "available");
    if (p) { setTarget(p); setForm({ ...EMPTY, provider: p.id }); setMessage(null); }
  };

  const connect = async () => {
    if (!target) return;
    setBusy(true);
    setMessage(null);
    try {
      if (target.availability !== "available") throw new Error(`${target.name} is not enabled in the current CenOps catalog.`);
      if (target.id === "github") {
        const r = await startGitHubAppInstall({ data: { connectionId: form.integrationId, displayName: form.displayName, environment: form.environment } });
        if (!r.ok) throw new Error(r.errorMessage);
        window.location.assign(r.installUrl);
        return;
      }
      if (target.id === "aws" && (!form.externalId || !form.trustPolicy)) {
        const r = await prepareAwsConnection({ data: { connectionId: form.integrationId } });
        if (!r.ok) throw new Error(r.errorMessage);
        setForm((x) => ({ ...x, integrationId: r.connectionId, externalId: r.externalId, trustPolicy: r.trustPolicy }));
        setMessage("AWS setup details generated. Create the IAM role with the displayed trust policy, then click Connect & verify again.");
        return;
      }
      const result: any = await startProvider(target, form);
      if (result?.authorizeUrl) { window.location.assign(result.authorizeUrl); return; }
      if (result?.ok === false) throw new Error(result.errorMessage ?? result.error ?? "Provider connection failed.");
      setTarget(null);
      setForm(EMPTY);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Provider connection failed.");
    } finally { setBusy(false); }
  };

  const removeConnections = async () => {
    setBusy(true);
    try {
      const results = await Promise.allSettled(removeTargets.map((c) => c.provider === "genesys" ? deleteGenesysIntegration({ data: { integrationId: c.id } }) : removeProviderIntegration({ data: { connectionId: c.id } })));
      if (results.some((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok))) {
        setMessage("One or more integrations could not be removed.");
      } else {
        setRemoveTargets([]); setSelectedIds(new Set()); setSelected(null); await load();
      }
    } finally { setBusy(false); }
  };

  return <div>
    <PageHeader title="Integrations" description="Manage connected enterprise environments as independent integration instances." />
    <Card className="mb-4"><CardHeader className="pb-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search integrations, accounts, environments…" className="pl-9" /></div><div className="flex gap-2"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All statuses</option><option value="connected">Connected</option><option value="failed">Action required</option><option value="disconnected">Disconnected</option></select><Button onClick={openAdd}><Plus className="mr-1.5 h-4 w-4" />Add integration</Button></div></div></CardHeader></Card>
    <Card><CardHeader><CardTitle>Connected integration instances <span className="ml-1 text-sm font-normal text-muted-foreground">{filtered.length}</span></CardTitle></CardHeader><CardContent className="p-0">{catalog === null ? <div className="p-8 text-center text-sm text-muted-foreground">Loading integrations…</div> : filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No integration instances match your filters.</div> : <div className="divide-y">{filtered.map((c) => { const p = catalog.providers.find((x) => x.id === c.provider); return <div key={c.id} className="flex cursor-pointer items-center gap-3 px-4 py-4 hover:bg-muted/40" onClick={() => setSelected(c)}><input type="checkbox" checked={selectedIds.has(c.id)} onChange={(e) => { e.stopPropagation(); setSelectedIds((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; }); }} /><ProviderLogo provider={p!} /><div className="min-w-0 flex-1"><div className="truncate font-medium">{c.display_name || p?.name || c.provider}</div><div className="truncate text-xs text-muted-foreground">{c.external_id || "No external account ID"}</div></div><Badge variant="secondary">{c.environment || "Production"}</Badge>{statusBadge(c.status)}<Link to="/help" search={{ topic: `provider-${c.provider}` }} onClick={(e) => e.stopPropagation()} className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Setup guide</Link><span className="hidden text-xs text-muted-foreground md:block">{relative(c.updated_at)}</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>; })}</div>}</CardContent></Card>
    <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>{selected?.display_name || "Integration details"}</DialogTitle><DialogDescription>Configuration and health for this integration instance.</DialogDescription></DialogHeader>{selected && <div className="space-y-3 text-sm"><div>Platform: <b>{catalog?.providers.find((p) => p.id === selected.provider)?.name}</b></div><div>Environment: <b>{selected.environment}</b></div><div>External account: <b className="break-all">{selected.external_id || "—"}</b></div>{selected.last_error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">{selected.last_error}</div>}<div className="flex items-center gap-2 rounded-md border p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Credentials remain encrypted and server-side.</div></div>}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Close</Button>{selected && <><Button asChild variant="outline"><Link to="/help" search={{ topic: `provider-${selected.provider}` }}>Setup guide</Link></Button><Button variant="destructive" onClick={() => setRemoveTargets([selected])}>Remove integration</Button></>}</DialogFooter></DialogContent></Dialog>
    <AlertDialog open={removeTargets.length > 0} onOpenChange={(o) => !o && setRemoveTargets([])}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove integration?</AlertDialogTitle><AlertDialogDescription>This removes the selected integration and its encrypted credentials.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); void removeConnections(); }} disabled={busy}>{busy ? "Removing…" : "Remove integration"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}><DialogContent className="sm:max-w-lg">{target && <><DialogHeader><DialogTitle>Add {target.name}</DialogTitle><DialogDescription>Enter the provider-specific credentials required by this connector.</DialogDescription></DialogHeader><div className="space-y-4"><div className="flex items-center justify-between gap-3"><select value={target.id} onChange={(e) => { const p = catalog?.providers.find((x) => x.id === e.target.value); if (p) { setTarget(p); setForm({ ...EMPTY, provider: p.id }); setMessage(null); } }} className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm">{catalog?.providers.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.availability === "available" ? "Available" : "Coming soon"}</option>)}</select><Button asChild variant="outline" size="sm"><Link to="/help" search={{ topic: `provider-${target.id}` }}>Setup guide</Link></Button></div><Field label="Integration name" value={form.displayName} onChange={(v) => set("displayName", v)} placeholder={`${target.name} Production`} /><Field label="Environment" value={form.environment} onChange={(v) => set("environment", v)} /><ProviderForm target={target} form={form} set={set}/>{message && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{message}</div>}</div><DialogFooter><Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button><Button onClick={connect} disabled={busy || target.availability !== "available"}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{target.availability === "available" ? (["jira","salesforce","servicenow","slack","hubspot","zendesk","gitlab","freshworks","zoho","confluence","snowflake","workday","sap"].includes(target.id) ? `Authorize ${target.name}` : "Connect & verify") : "Coming soon"}</Button></DialogFooter></>}</DialogContent></Dialog>
  </div>;
}
