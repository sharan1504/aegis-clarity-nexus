import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, Plug, Plus, Search, ShieldCheck, XCircle } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { pageHead } from "@/lib/seo";
import { connectProvider, getProviderCatalog } from "@/lib/integrations/provider-functions";
import { deleteGenesysIntegration, startGenesysOAuth } from "@/lib/integrations-genesys.functions";
import { GENESYS_REGIONS, DEFAULT_GENESYS_REGION } from "@/lib/genesys/errors";

export const Route = createFileRoute("/_app/integrations")({
  head: () => pageHead({ path: "/integrations", title: "Integrations — Aegis AI", description: "Manage enterprise integration instances and their health." }),
  component: IntegrationsPage,
});

type Catalog = Awaited<ReturnType<typeof getProviderCatalog>>;
type Provider = Catalog["providers"][number];
type Connection = Catalog["connections"][number];
type FormState = { integrationId?: string; provider: string; displayName: string; environment: string; tenant: string; clientId: string; clientSecret: string; accessToken: string; apiToken: string; baseUrl: string; region: string; accessKeyId: string; secretAccessKey: string; sessionToken: string };

const EMPTY: FormState = { provider: "", displayName: "", environment: "Production", tenant: "", clientId: "", clientSecret: "", accessToken: "", apiToken: "", baseUrl: "", region: DEFAULT_GENESYS_REGION, accessKeyId: "", secretAccessKey: "", sessionToken: "" };

function fieldNeeded(provider: Provider, field: keyof FormState) {
  if (["m365", "azure"].includes(provider.id)) return ["tenant", "clientId", "clientSecret"].includes(field);
  if (provider.id === "aws") return ["accessKeyId", "secretAccessKey", "sessionToken", "region"].includes(field);
  if (["servicenow", "salesforce"].includes(provider.id)) return ["accessToken", "baseUrl"].includes(field);
  return field === "accessToken";
}

function ProviderLogo({ provider }: { provider: Provider }) {
  const [failed, setFailed] = useState(false);
  return <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background p-1.5">
    {!failed ? <img src={provider.logoUrl} alt="" className="h-full w-full object-contain" loading="lazy" onError={() => setFailed(true)} /> : <span className="text-sm font-semibold text-muted-foreground">{provider.name.slice(0, 1)}</span>}
  </div>;
}

function ProviderPicker({ providers, value, onChange }: { providers: Provider[]; value: string; onChange: (provider: Provider) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = providers.find((provider) => provider.id === value) ?? providers[0];
  const filtered = providers.filter((provider) => `${provider.name} ${provider.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  if (!selected) return null;

  return <div className="relative">
    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Platform</label>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-11 w-full items-center gap-3 rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm transition-colors hover:bg-muted/30">
      <ProviderLogo provider={selected} />
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{selected.name}</span><span className="block truncate text-xs text-muted-foreground">{selected.category}</span></span>
      {selected.availability === "coming_soon" && <Badge variant="secondary" className="hidden sm:inline-flex">Coming soon</Badge>}
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
    {open && <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
      <div className="relative mb-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search platforms…" className="pl-9" /></div>
      <div role="listbox" className="max-h-80 overflow-y-auto pr-1">
        {filtered.length === 0 ? <div className="p-4 text-center text-sm text-muted-foreground">No platforms found.</div> : filtered.map((provider) => <button key={provider.id} type="button" role="option" aria-selected={provider.id === selected.id} onClick={() => { onChange(provider); setOpen(false); setQuery(""); }} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/60">
          <ProviderLogo provider={provider} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{provider.name}</span><span className="block truncate text-xs text-muted-foreground">{provider.category} · {provider.description}</span></span>
          {provider.availability === "available" ? <Badge variant="outline" className="shrink-0 text-[10px]">Available</Badge> : <Badge variant="secondary" className="shrink-0 text-[10px]">Coming soon</Badge>}
        </button>)}
      </div>
    </div>}
  </div>;
}

function statusBadge(status: string) {
  if (status === "connected") return <Badge variant="outline" className="border-success/30 bg-success/10 text-success"><CheckCircle2 className="mr-1 h-3 w-3" />Connected</Badge>;
  if (status === "failed") return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive"><XCircle className="mr-1 h-3 w-3" />Action required</Badge>;
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

function IntegrationsPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [selected, setSelected] = useState<Connection | null>(null);
  const [target, setTarget] = useState<Provider | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setCatalog(await getProviderCatalog()); } catch { setMessage("Unable to load integrations."); }
  };

  useEffect(() => { void load(); }, []);

  const connections = catalog?.connections ?? [];
  const environments = useMemo(() => [...new Set(connections.map((x) => x.environment).filter(Boolean))], [connections]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return connections.filter((x) => {
      const provider = catalog?.providers.find((p) => p.id === x.provider);
      const matchesText = !q || [provider?.name, provider?.category, x.display_name, x.external_id, x.environment].some((v) => String(v ?? "").toLowerCase().includes(q));
      return matchesText && (providerFilter === "all" || x.provider === providerFilter) && (statusFilter === "all" || x.status === statusFilter) && (environmentFilter === "all" || x.environment === environmentFilter);
    });
  }, [connections, catalog?.providers, search, providerFilter, statusFilter, environmentFilter]);

  const connect = async () => {
    if (!target) return;
    if (target.availability !== "available") { setMessage(`${target.name} is in the Aegis integration catalog and is coming soon. No credentials were requested.`); return; }
    setBusy(true); setMessage(null);
    try {
      if (target.id === "genesys") {
        if (!form.clientId.trim() || !form.clientSecret.trim()) { setMessage("Genesys Client ID and Client Secret are required for every new integration instance."); return; }
        const redirectUri = `${window.location.origin}/integrations/genesys/callback`;
        const result = await startGenesysOAuth({ data: { integrationId: form.integrationId, region: form.region || DEFAULT_GENESYS_REGION, redirectUri, clientId: form.clientId.trim(), clientSecret: form.clientSecret, displayName: form.displayName, environment: form.environment } });
        if (!result.ok) { setMessage(result.errorMessage); return; }
        window.location.assign(result.authorizeUrl);
        return;
      }

      const result = await connectProvider({ data: { ...form, provider: target.id } });
      if (result.ok) { setTarget(null); setForm(EMPTY); await load(); }
      else setMessage(result.error ?? "Provider connection failed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Provider connection failed."); }
    finally { setBusy(false); }
  };

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((x) => ({ ...x, [key]: e.target.value }));

  return <div>
    <PageHeader title="Integrations" description="Manage each connected enterprise environment as an independent integration instance." />

    <Card className="mb-4">
      <CardHeader className="pb-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search integrations, accounts, environments…" className="pl-9" /></div><div className="flex flex-wrap gap-2"><select aria-label="Provider filter" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All platforms</option>{catalog?.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="Status filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All statuses</option><option value="connected">Connected</option><option value="failed">Action required</option><option value="disconnected">Disconnected</option></select><select aria-label="Environment filter" value={environmentFilter} onChange={(e) => setEnvironmentFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All environments</option>{environments.map((e) => <option key={e} value={e}>{e}</option>)}</select><Button onClick={() => { const provider = catalog?.providers[0] ?? null; setTarget(provider); setForm({ ...EMPTY, provider: provider?.id ?? "" }); setMessage(null); }}><Plus className="mr-1.5 h-4 w-4" />Add integration</Button></div></div></CardHeader>
    </Card>

    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Connected integration instances <span className="ml-1 text-sm font-normal text-muted-foreground">{filtered.length}</span></CardTitle></CardHeader>
      <CardContent className="p-0">
        {catalog === null ? <div className="p-8 text-center text-sm text-muted-foreground">Loading integrations…</div> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No integration instances match your filters.</div> : <div className="divide-y">
          {filtered.map((connection) => { const provider = catalog.providers.find((p) => p.id === connection.provider); return <button key={connection.id} onClick={() => setSelected(connection)} className="grid w-full grid-cols-1 items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 md:grid-cols-[minmax(220px,1.4fr)_140px_130px_150px_110px_24px]">
            <div className="min-w-0"><div className="flex items-center gap-2">{provider ? <ProviderLogo provider={provider} /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">?</div>}<div className="min-w-0"><div className="truncate font-medium">{connection.display_name || provider?.name || connection.provider}</div><div className="truncate text-xs text-muted-foreground">{connection.external_id || "No external account ID"}</div></div></div></div>
            <div><div className="text-xs text-muted-foreground">Environment</div><Badge variant="secondary" className="mt-1">{connection.environment || "Production"}</Badge></div>
            <div><div className="text-xs text-muted-foreground">Status</div><div className="mt-1">{statusBadge(connection.status)}</div></div>
            <div><div className="text-xs text-muted-foreground">Last sync</div><div className="mt-1 text-sm">{relative(connection.last_sync_at)}</div></div>
            <div className="text-xs text-muted-foreground">Updated {relative(connection.updated_at)}</div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>; })}
        </div>}
      </CardContent>
    </Card>

    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{selected?.display_name || "Integration details"}</DialogTitle><DialogDescription>Configuration and health for this specific integration instance.</DialogDescription></DialogHeader>{selected && catalog && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm"><div><div className="text-xs text-muted-foreground">Platform</div><div className="mt-1 flex items-center gap-2 font-medium">{(() => { const provider = catalog.providers.find((p) => p.id === selected.provider); return provider ? <><ProviderLogo provider={provider} />{provider.name}</> : selected.provider; })()}</div></div><div><div className="text-xs text-muted-foreground">Environment</div><div className="mt-1 font-medium">{selected.environment}</div></div><div><div className="text-xs text-muted-foreground">External account</div><div className="mt-1 break-all font-medium">{selected.external_id || "—"}</div></div><div><div className="text-xs text-muted-foreground">Status</div><div className="mt-1">{statusBadge(selected.status)}</div></div><div><div className="text-xs text-muted-foreground">Last sync</div><div className="mt-1">{relative(selected.last_sync_at)}</div></div><div><div className="text-xs text-muted-foreground">Connected</div><div className="mt-1">{relative(selected.connected_at)}</div></div></div>{selected.last_error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{selected.last_error}</div>}<div className="flex items-center gap-2 rounded-md border p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Credentials remain server-side and encrypted. Instance data is tenant-scoped.</div></div>}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Close</Button>{selected?.provider === "genesys" && <Button variant="destructive" onClick={async () => { if (!selected) return; if (!window.confirm("Delete this integration and its synced data? This cannot be undone.")) return; setBusy(true); setMessage(null); try { const result = await deleteGenesysIntegration({ data: { integrationId: selected.id } }); if (!result.ok) { setMessage(result.errorMessage); return; } setSelected(null); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to delete integration."); } finally { setBusy(false); } }}>Delete</Button>}<Button onClick={() => { if (!selected) return; const provider = catalog?.providers.find((p) => p.id === selected.provider); if (provider) { setSelected(null); setTarget(provider); setForm({ ...EMPTY, integrationId: selected.id, provider: provider.id, displayName: selected.display_name ?? "", environment: selected.environment ?? "Production" }); } }}>Reconfigure</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}><DialogContent className="sm:max-w-lg">{target && <><DialogHeader><DialogTitle>{form.integrationId ? `Reconfigure ${target.name} integration` : `Add ${target.name} integration`}</DialogTitle><DialogDescription>Configure this integration instance. Reconfigure keeps the same instance; Add integration creates a new one.</DialogDescription></DialogHeader><div className="space-y-3 py-2"><ProviderPicker providers={catalog?.providers ?? []} value={target.id} onChange={(provider) => { setTarget(provider); setForm((current) => ({ ...current, provider: provider.id })); setMessage(null); }} /><Input placeholder="Integration name (e.g. Genesys Production)" value={form.displayName} onChange={set("displayName")} /><Input placeholder="Environment (Production, Development, UAT…)" value={form.environment} onChange={set("environment")} />{target.id === "genesys" ? <div className="space-y-3 rounded-md border p-3"><div><div className="text-sm font-medium">{form.integrationId ? "Reconfigure Genesys OAuth" : "Fresh Genesys OAuth configuration"}</div><div className="mt-1 text-xs text-muted-foreground">Each Genesys instance uses its own OAuth client. These credentials are stored only on the server and are never returned to the browser.</div></div><Input placeholder="Genesys OAuth Client ID" value={form.clientId} onChange={set("clientId")} autoComplete="off" /><Input type="password" placeholder="Genesys OAuth Client Secret" value={form.clientSecret} onChange={set("clientSecret")} autoComplete="new-password" /><div className="space-y-1"><label className="text-xs font-medium text-muted-foreground" htmlFor="genesys-region">Genesys Cloud region</label><select id="genesys-region" aria-label="Genesys Cloud region" value={form.region || DEFAULT_GENESYS_REGION} onChange={(e) => setForm((current) => ({ ...current, region: e.target.value }))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{GENESYS_REGIONS.map((region) => <option key={region.id} value={region.id}>{region.label} — {region.id}</option>)}</select></div><div className="text-xs text-muted-foreground">Reconfigure keeps this integration instance ID and OAuth state. A failed authorization will mark this same instance as Action required rather than creating a duplicate.</div></div> : target.id === "aws" ? <><Input placeholder="AWS access key ID" value={form.accessKeyId} onChange={set("accessKeyId")} autoComplete="off" /><Input type="password" placeholder="AWS secret access key" value={form.secretAccessKey} onChange={set("secretAccessKey")} autoComplete="new-password" /><Input type="password" placeholder="AWS session token (optional)" value={form.sessionToken} onChange={set("sessionToken")} autoComplete="off" /><Input placeholder="AWS region (e.g. us-east-1)" value={form.region} onChange={set("region")} /></> : <>{fieldNeeded(target, "tenant") && <Input placeholder="Tenant ID" value={form.tenant} onChange={set("tenant")} />}{fieldNeeded(target, "clientId") && <Input placeholder="Client ID" value={form.clientId} onChange={set("clientId")} />}{fieldNeeded(target, "clientSecret") && <Input type="password" placeholder="Client secret" value={form.clientSecret} onChange={set("clientSecret")} />}{fieldNeeded(target, "baseUrl") && <Input placeholder="Provider base URL" value={form.baseUrl} onChange={set("baseUrl")} />}{fieldNeeded(target, "accessToken") && <Input type="password" placeholder="Provider access token" value={form.accessToken} onChange={set("accessToken")} autoComplete="off" />}</>}<div className="flex items-center gap-2 rounded-md border p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />Aegis validates the provider before storing the encrypted credentials.</div>{target.availability === "coming_soon" && <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">Catalog only:</span> {target.name} is visible for discovery and planning, but its production connector is not enabled yet.</div>}{message && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{message}</div>}</div><DialogFooter><Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button><Button onClick={connect} disabled={busy || target.availability !== "available"}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{busy ? "Validating…" : target.availability === "coming_soon" ? "Coming soon" : target.id === "genesys" ? "Authorize Genesys" : "Connect & verify"}</Button></DialogFooter></>}</DialogContent></Dialog>
  </div>;
}
