import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, ShieldCheck, XCircle } from "lucide-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getProviderCatalog, connectProvider, prepareAwsConnection } from "@/lib/integrations/provider-functions";
import type { ProviderId } from "@/lib/integrations/production-connectors.server";
import { startGenesysOAuth } from "@/lib/integrations-genesys.functions";
import { startGitHubAppInstall } from "@/lib/integrations/github-app.functions";
import { startJiraOAuth, startSalesforceOAuth, startServiceNowOAuth, startSlackOAuth, startHubSpotOAuth, startZendeskOAuth, startGitLabOAuth, startFreshworksOAuth, startZohoOAuth, startConfluenceOAuth, startSnowflakeOAuth, startCrowdStrikeOAuth, startGoogleCloudConnection, startGoogleWorkspaceConnection } from "@/lib/integrations/oauth-provider.functions";
import { startSapOAuth } from "@/lib/integrations/sap.functions";
import { startCohesityConnection, startDatadogConnection, startDefenderConnection, startMongoDbConnection, startNewRelicConnection, startOktaConnection, startOracleConnection, startPagerDutyConnection, startRubrikConnection, startSplunkConnection, startVeeamConnection, startWorkdayConnection } from "@/lib/integrations/provider-credential.functions";
import { DEFAULT_GENESYS_REGION, GENESYS_REGIONS } from "@/lib/genesys/errors";
import { MAX_PROVIDER_INSTANCES } from "@/lib/integrations/provider-instance-limit";
import { ProviderDetailsHeader, CapabilityList, ProviderLogo } from "@/lib/integrations/integrations-catalog-ui";
import { pageHead } from "@/lib/seo";

type Catalog = Awaited<ReturnType<typeof getProviderCatalog>>;
type Provider = Catalog["providers"][number];
type FormState = Record<string, string | undefined> & { integrationId?: string; provider: string; displayName: string; environment: string };
const OAUTH_CALLBACK_PATHS: Record<string, string> = {
  jira: "/integrations/jira/callback", salesforce: "/integrations/salesforce/callback", slack: "/integrations/slack/callback",
  servicenow: "/integrations/servicenow/callback", hubspot: "/integrations/hubspot/callback", zendesk: "/integrations/zendesk/callback",
  gitlab: "/integrations/gitlab/callback", freshworks: "/integrations/freshworks/callback", zoho: "/integrations/zoho/callback",
  confluence: "/integrations/confluence/callback", snowflake: "/integrations/snowflake/callback", sap: "/integrations/sap/callback",
  workday: "/integrations/workday/callback",
};
function callbackUri(providerId: keyof typeof OAUTH_CALLBACK_PATHS): string { return window.location.origin + OAUTH_CALLBACK_PATHS[providerId]; }
const EMPTY: FormState = { provider: "", displayName: "", environment: "Production", clientId: "", clientSecret: "", baseUrl: "", apiKey: "", appKey: "", apiToken: "", region: DEFAULT_GENESYS_REGION, roleArn: "", externalId: "", trustPolicy: "", tenantAlias: "", customerTenantId: "", projectId: "", clientEmail: "", privateKey: "", delegatedAdminEmail: "", accountsUrl: "https://accounts.zoho.com", orgUrl: "", subdomain: "", accessTokenUri: "", scope: "", accountUrl: "", username: "", password: "", token: "", site: "datadoghq.com", authorizationUrl: "", tokenUrl: "" };
function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value?: string; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <div><label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label><Input type={type} value={value ?? ""} placeholder={placeholder ?? label} onChange={(e) => onChange(e.target.value)} autoComplete={type === "password" ? "new-password" : "off"} /></div>; }
function ProviderForm({ target, form, set }: { target: Provider; form: FormState; set: (key: string, value: string) => void }) {
  const id = target.id;
  if (id === "github") return <div className="rounded-md border p-4 text-sm">CenOps will open GitHub to install the App and select repositories. No GitHub token is entered here.</div>;
  if (id === "genesys") return <div className="space-y-3"><Field label="Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /><select value={form.region || DEFAULT_GENESYS_REGION} onChange={(e) => set("region", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{GENESYS_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.id}</option>)}</select></div>;
  if (id === "azure" || id === "m365") return <div className="space-y-3"><Field label="Microsoft Entra Tenant ID" value={form.tenant} onChange={(v) => set("tenant", v)} /><Field label="Application Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "aws") return <div className="space-y-3"><Field label="AWS Role ARN" value={form.roleArn} onChange={(v) => set("roleArn", v)} /><div className="rounded-md bg-muted/40 p-3 text-xs"><b>External ID</b><div className="mt-1 break-all font-mono">{form.externalId || "Click Connect & verify to generate one."}</div></div>{form.trustPolicy && <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{form.trustPolicy}</pre>}</div>;
  if (["jira", "salesforce", "slack", "servicenow"].includes(id)) return <div className="space-y-3">{id === "servicenow" && <Field label="ServiceNow instance URL" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} placeholder="https://yourinstance.service-now.com" />}<Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
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
  if (id === "crowdstrike") return <div className="space-y-3"><Field label="Falcon OAuth API base URL" value={form.apiBaseUrl} onChange={(v) => set("apiBaseUrl", v)} /><Field label="Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "microsoft-defender") return <div className="space-y-3"><Field label="Microsoft Entra Tenant ID" value={form.customerTenantId} onChange={(v) => set("customerTenantId", v)} /><Field label="Application Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "okta") return <div className="space-y-3"><Field label="Okta org URL" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} placeholder="https://yourorg.okta.com" /><Field label="SSWS API Token" type="password" value={form.apiToken} onChange={(v) => set("apiToken", v)} /></div>;
  if (id === "datadog") return <div className="space-y-3"><Field label="Datadog site" value={form.site} onChange={(v) => set("site", v)} placeholder="datadoghq.com" /><Field label="API Key" type="password" value={form.apiKey} onChange={(v) => set("apiKey", v)} /><Field label="Application Key" type="password" value={form.appKey} onChange={(v) => set("appKey", v)} /></div>;
  if (id === "newrelic") return <div className="space-y-3"><select value={form.region || "us"} onChange={(e) => set("region", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="us">US</option><option value="eu">EU</option><option value="jp">Japan</option></select><Field label="New Relic User API Key" type="password" value={form.apiKey} onChange={(v) => set("apiKey", v)} /></div>;
  if (id === "splunk") return <div className="space-y-3"><Field label="Splunk REST API base URL" value={form.baseUrl} onChange={(v) => set("baseUrl", v)} placeholder="https://host:8089" /><Field label="Bearer token" type="password" value={form.token} onChange={(v) => set("token", v)} /></div>;
  if (id === "pagerduty") return <Field label="PagerDuty REST API token" type="password" value={form.apiToken} onChange={(v) => set("apiToken", v)} />;
  if (id === "workday") return <div className="space-y-3"><select value={form.region || "us"} onChange={(e) => set("region", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="us">US</option><option value="usWcp">US WCP</option><option value="eu">EU</option><option value="sg">Singapore</option><option value="uk">UK</option></select><Field label="Workday tenant alias" value={form.tenantAlias} onChange={(v) => set("tenantAlias", v)} /><Field label="Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "sap") return <div className="space-y-3"><div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">SAP exposes OAuth 2.0 through product/tenant-specific authorization services. Enter the documented endpoints from your SAP BTP or SAP product service binding; CenOps does not guess them.</div><Field label="OAuth Authorization URL" value={form.authorizationUrl} onChange={(v) => set("authorizationUrl", v)} placeholder="https://…/oauth/authorize" /><Field label="OAuth Token URL" value={form.tokenUrl} onChange={(v) => set("tokenUrl", v)} placeholder="https://…/oauth/token" /><Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /><Field label="Scope" value={form.scope} onChange={(v) => set("scope", v)} /></div>;
  if (id === "oracle") return <div className="space-y-3"><Field label="Oracle identity domain URL" value={form.identityDomainUrl} onChange={(v) => set("identityDomainUrl", v)} /><Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  if (id === "snowflake") return <div className="space-y-3"><Field label="Snowflake account URL" value={form.accountUrl} onChange={(v) => set("accountUrl", v)} /><Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /><Field label="Scope" value={form.scope} onChange={(v) => set("scope", v)} /></div>;
  if (id === "mongodb") return <div className="space-y-3"><Field label="MongoDB Atlas account URL" value={form.accountUrl} onChange={(v) => set("accountUrl", v)} /><Field label="OAuth Client ID" value={form.clientId} onChange={(v) => set("clientId", v)} /><Field label="OAuth Client Secret" type="password" value={form.clientSecret} onChange={(v) => set("clientSecret", v)} /></div>;
  return <div className="rounded-md border p-4 text-sm text-muted-foreground">Provider-specific credentials are not exposed in this flow yet. Use the setup guide for prerequisites.</div>;
}
function ProviderConnectPanel({ target, connectionId }: { target: Provider; connectionId?: string }) {
  const navigate = useNavigate();
  const existingConnection = connectionId ? target.connections.find((connection) => connection.id === connectionId) : undefined;
  const [form, setForm] = useState<FormState>({
    ...EMPTY,
    provider: target.id,
    integrationId: existingConnection?.id,
    displayName: existingConnection?.display_name || target.name + " Production",
    environment: existingConnection?.environment || "Production",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const startGitHub = useServerFn(startGitHubAppInstall);
  const startGenesys = useServerFn(startGenesysOAuth);
  const prepareAws = useServerFn(prepareAwsConnection);
  const saveProvider = useServerFn(connectProvider);
  const startJira = useServerFn(startJiraOAuth);
  const startSalesforce = useServerFn(startSalesforceOAuth);
  const startServiceNow = useServerFn(startServiceNowOAuth);
  const startSlack = useServerFn(startSlackOAuth);
  const startHubSpot = useServerFn(startHubSpotOAuth);
  const startZendesk = useServerFn(startZendeskOAuth);
  const startGitLab = useServerFn(startGitLabOAuth);
  const startFreshworks = useServerFn(startFreshworksOAuth);
  const startZoho = useServerFn(startZohoOAuth);
  const startConfluence = useServerFn(startConfluenceOAuth);
  const startSnowflake = useServerFn(startSnowflakeOAuth);
  const startCrowdStrike = useServerFn(startCrowdStrikeOAuth);
  const startGcp = useServerFn(startGoogleCloudConnection);
  const startGoogleWorkspace = useServerFn(startGoogleWorkspaceConnection);
  const startSap = useServerFn(startSapOAuth);
  const startCohesity = useServerFn(startCohesityConnection);
  const startDatadog = useServerFn(startDatadogConnection);
  const startDefender = useServerFn(startDefenderConnection);
  const startMongoDb = useServerFn(startMongoDbConnection);
  const startNewRelic = useServerFn(startNewRelicConnection);
  const startOkta = useServerFn(startOktaConnection);
  const startOracle = useServerFn(startOracleConnection);
  const startPagerDuty = useServerFn(startPagerDutyConnection);
  const startRubrik = useServerFn(startRubrikConnection);
  const startSplunk = useServerFn(startSplunkConnection);
  const startVeeam = useServerFn(startVeeamConnection);
  const startWorkday = useServerFn(startWorkdayConnection);

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const editing = Boolean(form.integrationId);
  const limitReached = target.connections.length >= MAX_PROVIDER_INSTANCES && !editing;

  type ConnectionResult = { kind: "redirect"; url: string } | { kind: "connected" };

  const mutation = useMutation<ConnectionResult, Error>({
    mutationFn: async () => {
      if (limitReached) throw new Error("Maximum of 5 instances allowed for this provider in this workspace.");

      const redirect = (result: unknown): string | undefined => {
        if (!result || typeof result !== "object") return undefined;
        const value = result as Record<string, unknown>;
        const authorizeUrl = typeof value.authorizeUrl === "string" ? value.authorizeUrl : undefined;
        const authorizationUrl = typeof value.authorizationUrl === "string" ? value.authorizationUrl : undefined;
        const installUrl = typeof value.installUrl === "string" ? value.installUrl : undefined;
        return installUrl ?? authorizeUrl ?? authorizationUrl;
      };

      const finish = (result: unknown, fallback: string): ConnectionResult => {
        if (result && typeof result === "object") {
          const value = result as Record<string, unknown>;
          if (value.ok === false) {
            throw new Error(
              (typeof value.errorMessage === "string" && value.errorMessage) ||
              (typeof value.error === "string" && value.error) ||
              fallback,
            );
          }
          const url = redirect(result);
          if (url) return { kind: "redirect", url };
        }
        return { kind: "connected" };
      };

      if (target.id === "github") {
        const result = await startGitHub({
          data: {
            connectionId: form.integrationId,
            displayName: form.displayName,
            environment: form.environment,
          },
        });
        return finish(result, "Unable to start the GitHub App installation.");
      }

      if (target.id === "genesys") {
        const result = await startGenesys({
          data: {
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            region: form.region || DEFAULT_GENESYS_REGION,
            displayName: form.displayName,
            environment: form.environment,
            integrationId: form.integrationId,
            redirectUri: window.location.origin + "/integrations/genesys/callback",
          },
        });
        return finish(result, "Unable to start Genesys OAuth.");
      }

      if (target.id === "aws") {
        const prepared = await prepareAws({ data: { connectionId: form.integrationId } });
        if (!prepared.ok) throw new Error(prepared.errorMessage);
        const roleArn = form.roleArn?.trim();
        if (!roleArn) {
          setForm((current) => ({
            ...current,
            integrationId: prepared.connectionId,
            externalId: prepared.externalId,
            trustPolicy: prepared.trustPolicy,
          }));
          throw new Error("Enter the AWS Role ARN, then click Connect & verify again.");
        }
        const connected = await saveProvider({
          data: {
            provider: "aws",
            connectionId: prepared.connectionId,
            roleArn,
            externalId: prepared.externalId,
            displayName: form.displayName,
            environment: form.environment,
          },
        });
        return finish(connected, "AWS connection failed.");
      }

      const callbacks = {
        jira: callbackUri("jira"),
        salesforce: callbackUri("salesforce"),
        slack: callbackUri("slack"),
        servicenow: callbackUri("servicenow"),
        hubspot: callbackUri("hubspot"),
        zendesk: callbackUri("zendesk"),
        gitlab: callbackUri("gitlab"),
        freshworks: callbackUri("freshworks"),
        zoho: callbackUri("zoho"),
        confluence: callbackUri("confluence"),
        snowflake: callbackUri("snowflake"),
        sap: callbackUri("sap"),
        workday: callbackUri("workday"),
      };

      switch (target.id) {
        case "jira":
          return finish(await startJira({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            redirectUri: callbacks.jira,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start Jira OAuth.");
        case "salesforce":
          return finish(await startSalesforce({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || undefined,
            redirectUri: callbacks.salesforce,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start Salesforce OAuth.");
        case "slack":
          return finish(await startSlack({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            redirectUri: callbacks.slack,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start Slack OAuth.");
        case "servicenow":
          return finish(await startServiceNow({ data: {
            connectionId: form.integrationId,
            instanceUrl: form.baseUrl || "",
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            redirectUri: callbacks.servicenow,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start ServiceNow OAuth.");
        case "hubspot":
          return finish(await startHubSpot({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            redirectUri: callbacks.hubspot,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start HubSpot OAuth.");
        case "zendesk":
          return finish(await startZendesk({ data: {
            connectionId: form.integrationId,
            subdomain: form.subdomain || "",
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            redirectUri: callbacks.zendesk,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start Zendesk OAuth.");
        case "gitlab":
          return finish(await startGitLab({ data: {
            connectionId: form.integrationId,
            instanceUrl: form.baseUrl || "",
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            redirectUri: callbacks.gitlab,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start GitLab OAuth.");
        case "freshworks":
          return finish(await startFreshworks({ data: {
            connectionId: form.integrationId,
            orgUrl: form.orgUrl || "",
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            redirectUri: callbacks.freshworks,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start Freshworks OAuth.");
        case "zoho":
          return finish(await startZoho({ data: {
            connectionId: form.integrationId,
            accountsUrl: form.accountsUrl || "",
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            redirectUri: callbacks.zoho,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start Zoho OAuth.");
        case "confluence":
          return finish(await startConfluence({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            redirectUri: callbacks.confluence,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start Confluence OAuth.");
        case "snowflake":
          return finish(await startSnowflake({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            accountUrl: form.accountUrl || "",
            redirectUri: callbacks.snowflake,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start Snowflake OAuth.");
        case "sap":
          return finish(await startSap({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            authorizationUrl: form.authorizationUrl || "",
            tokenUrl: form.tokenUrl || "",
            scope: form.scope || undefined,
            redirectUri: callbacks.sap,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start SAP OAuth.");
        case "crowdstrike":
          return finish(await startCrowdStrike({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            apiBaseUrl: form.apiBaseUrl || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "CrowdStrike connection failed.");
        case "gcp":
          return finish(await startGcp({ data: {
            connectionId: form.integrationId,
            clientEmail: form.clientEmail || "",
            privateKey: form.privateKey || "",
            projectId: form.projectId || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "Google Cloud connection failed.");
        case "google-workspace":
          return finish(await startGoogleWorkspace({ data: {
            connectionId: form.integrationId,
            clientEmail: form.clientEmail || "",
            privateKey: form.privateKey || "",
            delegatedAdminEmail: form.delegatedAdminEmail || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "Google Workspace connection failed.");
        case "cohesity":
          return finish(await startCohesity({ data: {
            connectionId: form.integrationId,
            baseUrl: form.baseUrl || "",
            apiKey: form.apiKey || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "Cohesity connection failed.");
        case "datadog":
          return finish(await startDatadog({ data: {
            connectionId: form.integrationId,
            apiKey: form.apiKey || "",
            appKey: form.appKey || "",
            site: form.site || undefined,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Datadog connection failed.");
        case "microsoft-defender":
          return finish(await startDefender({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            customerTenantId: form.customerTenantId || undefined,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Microsoft Defender connection failed.");
        case "mongodb":
          return finish(await startMongoDb({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "MongoDB connection failed.");
        case "newrelic":
          return finish(await startNewRelic({ data: {
            connectionId: form.integrationId,
            apiKey: form.apiKey || "",
            region: (form.region || "us") as "us" | "eu" | "jp",
            displayName: form.displayName,
            environment: form.environment,
          }}), "New Relic connection failed.");
        case "okta":
          return finish(await startOkta({ data: {
            connectionId: form.integrationId,
            baseUrl: form.baseUrl || "",
            apiToken: form.apiToken || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "Okta connection failed.");
        case "oracle":
          return finish(await startOracle({ data: {
            connectionId: form.integrationId,
            identityDomainUrl: form.identityDomainUrl || "",
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            scope: form.scope || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "Oracle connection failed.");
        case "pagerduty":
          return finish(await startPagerDuty({ data: {
            connectionId: form.integrationId,
            apiToken: form.apiToken || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "PagerDuty connection failed.");
        case "rubrik":
          return finish(await startRubrik({ data: {
            connectionId: form.integrationId,
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            accessTokenUri: form.accessTokenUri || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "Rubrik connection failed.");
        case "splunk":
          return finish(await startSplunk({ data: {
            connectionId: form.integrationId,
            baseUrl: form.baseUrl || "",
            token: form.token || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "Splunk connection failed.");
        case "veeam":
          return finish(await startVeeam({ data: {
            connectionId: form.integrationId,
            baseUrl: form.baseUrl || "",
            username: form.username || "",
            password: form.password || "",
            displayName: form.displayName,
            environment: form.environment,
          }}), "Veeam connection failed.");
        case "workday":
          return finish(await startWorkday({ data: {
            connectionId: form.integrationId,
            region: (form.region || "us") as "us" | "usWcp" | "eu" | "sg" | "uk",
            tenantAlias: form.tenantAlias || "",
            clientId: form.clientId || "",
            clientSecret: form.clientSecret || "",
            redirectUri: callbacks.workday,
            displayName: form.displayName,
            environment: form.environment,
          }}), "Unable to start Workday OAuth.");
        case "azure":
        case "m365":
          return finish(await saveProvider({
            data: {
              provider: target.id as ProviderId,
              connectionId: form.integrationId,
              tenant: form.tenant || "",
              clientId: form.clientId || "",
              clientSecret: form.clientSecret || "",
              displayName: form.displayName,
              environment: form.environment,
            },
          }), target.name + " connection failed.");
        default:
          throw new Error(target.name + " does not have a connection handler in the catalog.");
      }
    },
    onMutate: () => {
      setError(null);
      setSuccess(false);
    },
    onSuccess: (result) => {
      if (result.kind === "redirect") {
        window.location.assign(result.url);
        return;
      }
      setSuccess(true);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Connection failed.");
      if (import.meta.env.DEV) console.error("[integrations] connection failed", { provider: target.id, error: cause });
    },
  });

  const submit = () => {
    if (limitReached) {
      setError("Maximum of 5 instances allowed for this provider in this workspace.");
      return;
    }
    mutation.mutate();
  };

  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-3">
        <ProviderLogo provider={target} className="h-9 w-9" />
        {editing ? "Edit" : "Connect"} {target.name}
      </CardTitle>
      <p className="text-sm text-muted-foreground">
        {editing
          ? "Update this integration instance without creating another instance."
          : "Each new instance gets its own connection id. You can install the same provider again with a different name and environment until the five-instance limit is reached."}
      </p>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Integration name" value={form.displayName} onChange={(v) => set("displayName", v)} placeholder={target.name + " Production"} />
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Environment</label>
          <select value={form.environment} onChange={(e) => set("environment", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option>Production</option><option>Staging</option><option>Development</option>
          </select>
        </div>
      </div>
      {limitReached && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Maximum of {MAX_PROVIDER_INSTANCES} instances allowed for this provider in this workspace.</div>}
      <ProviderForm target={target} form={form} set={set} />
      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {success && <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">Connection accepted by the existing provider flow. Final Connected state will only appear after evidence-derived health and sync checks succeed.</div>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={mutation.isPending || target.availability !== "available" || limitReached}
        >
          {mutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {mutation.isPending ? "Connecting…" : limitReached ? "Limit reached" : target.id === "github" ? "Authorize GitHub App" : editing ? "Save changes" : ["genesys", "jira", "salesforce", "slack", "servicenow", "hubspot", "zendesk", "gitlab", "freshworks", "zoho", "confluence", "snowflake", "sap", "workday"].includes(target.id) ? "Authorize " + target.name : "Connect & verify"}
        </Button>
        <Button type="button" asChild variant="outline"><Link to="/help" search={{ topic: "provider-" + target.id }}>Setup guide</Link></Button>
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/integrations/catalog" })}>Back</Button>
      </div>
    </CardContent>
  </Card>;
}
function ProviderDetailsPage() {
  const { providerId } = Route.useParams();
  const { mode, connectionId } = Route.useSearch();
  const { providers } = Route.useLoaderData();
  const provider = useMemo(() => providers.find((item) => item.id === providerId), [providers, providerId]);

  if (import.meta.env.DEV && !provider) {
    console.debug("[integrations] provider lookup failed", {
      providerId,
      availableProviderIds: providers.map((item) => item.id),
      mode,
    });
  }

  if (!provider) return <Card><CardContent className="py-12 text-center"><XCircle className="mx-auto h-8 w-8 text-destructive" /><p className="mt-3 font-medium">Provider not found</p><p className="mt-1 text-sm text-muted-foreground">We could not find provider <code className="rounded bg-muted px-1.5 py-0.5">{providerId}</code> in the current catalog.</p><Button asChild className="mt-4"><Link to="/integrations/catalog">Back to catalog</Link></Button></CardContent></Card>; const selectedConnection = connectionId ? provider.connections.find((connection) => connection.id === connectionId) : undefined; return <div className="space-y-6"><PageHeader title={provider.name} description="Review provider requirements, capabilities, and connection details." /><ProviderDetailsHeader provider={provider} /><div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]"><div><Card><CardHeader><CardTitle>Capabilities</CardTitle></CardHeader><CardContent><div className="space-y-4"><CapabilityList provider={provider} /><div className="rounded-lg border bg-muted/30 p-4 text-sm"><div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" />Contract status</div><p className="mt-1 text-muted-foreground">{provider.capabilities.includes("read") && provider.capabilities.includes("sync") ? "Provider is represented as read/sync capable in the registry. Actual Connected status remains evidence-derived." : "Provider is registry-only for this flow."}</p></div><div><h3 className="text-sm font-medium">Prerequisites</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground"><li>Tenant administrator or manager access in CenOps.</li><li>{provider.auth} credentials or authorization access for the provider.</li><li>Required provider-side scopes: {provider.scopes.join(", ")}.</li></ul></div></div></CardContent></Card></div><div><Card><CardHeader><CardTitle>{mode === "connect" ? selectedConnection ? "Edit integration" : "Install / connect" : "Ready to connect"}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{provider.availability === "available" ? selectedConnection ? `Editing ${selectedConnection.display_name || provider.name} (${selectedConnection.environment}).` : "Continue to the dedicated connection step. The provider cannot be switched mid-flow." : "This provider is currently marked coming soon and cannot be connected."}</p>{mode !== "connect" && provider.availability === "available" && <Button asChild className="mt-4 w-full"><Link to="/integrations/catalog/$providerId" params={{ providerId: provider.id }} search={{ mode: "connect" }}>Install / Connect</Link></Button>}</CardContent></Card></div></div>{mode === "connect" && <ProviderConnectPanel target={provider} connectionId={connectionId} />}</div>; }

export const Route = createFileRoute("/_app/integrations/catalog/$providerId")({
  validateSearch: (search: Record<string, unknown>) => ({ mode: search.mode === "connect" ? "connect" as const : "details" as const, connectionId: typeof search.connectionId === "string" ? search.connectionId : undefined }),
  head: ({ params }) => pageHead({ path: `/integrations/catalog/${params.providerId}`, title: "Integration — CenOps", description: "Review provider details and connect an enterprise integration." }),
  loader: async () => getProviderCatalog(),
  component: ProviderDetailsPage,
});