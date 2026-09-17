import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Plug, Plus, Search, ShieldCheck, XCircle } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { pageHead } from "@/lib/seo";
import { getProviderCatalog, removeProviderIntegration } from "@/lib/integrations/provider-functions";
import { deleteGenesysIntegration } from "@/lib/integrations-genesys.functions";

export const Route = createFileRoute("/_app/integrations")({
  head: () => pageHead({ path: "/integrations", title: "Integrations — CenOps", description: "Manage enterprise integration instances and their health." }),
  component: IntegrationsPage,
});

type Catalog = Awaited<ReturnType<typeof getProviderCatalog>>;
type Provider = Catalog["providers"][number];
type Connection = Catalog["connections"][number];

function ProviderLogo({ provider }: { provider?: Provider }) {
  const [failed, setFailed] = useState(false);
  if (!provider) return <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background text-sm text-muted-foreground">?</div>;
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

function IntegrationsPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Connection | null>(null);
  const [removeTargets, setRemoveTargets] = useState<Connection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
    <PageHeader title="Integrations" description="Manage connected enterprise environments as independent integration instances." actions={<div className="flex gap-2"><Button asChild><Link to="/integrations/catalog"><Plus className="mr-1.5 h-4 w-4" />Add integration</Link></Button><Button asChild variant="outline"><Link to="/integrations/catalog">Browse catalog</Link></Button></div>} />
    <Card className="mb-4"><CardHeader className="pb-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search integrations, accounts, environments…" className="pl-9" /></div><div className="flex gap-2"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All statuses</option><option value="connected">Connected</option><option value="failed">Action required</option><option value="disconnected">Disconnected</option></select></div></div></CardHeader></Card>
    <Card><CardHeader><CardTitle>Connected integration instances <span className="ml-1 text-sm font-normal text-muted-foreground">{filtered.length}</span></CardTitle></CardHeader><CardContent className="p-0">{catalog === null ? <div className="p-8 text-center text-sm text-muted-foreground">Loading integrations…</div> : filtered.length === 0 ? <div className="p-8 text-center"><div className="text-sm text-muted-foreground">No integration instances match your filters.</div><div className="mt-4"><Button asChild><Link to="/integrations/catalog"><Plus className="mr-1.5 h-4 w-4" />Browse integrations</Link></Button></div></div> : <div className="divide-y">{filtered.map((c) => { const p = catalog.providers.find((x) => x.id === c.provider); return <div key={c.id} className="flex cursor-pointer items-center gap-3 px-4 py-4 hover:bg-muted/40" onClick={() => setSelected(c)}><input type="checkbox" checked={selectedIds.has(c.id)} onChange={(e) => { e.stopPropagation(); setSelectedIds((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; }); }} /><ProviderLogo provider={p} /><div className="min-w-0 flex-1"><div className="truncate font-medium">{c.display_name || p?.name || c.provider}</div><div className="truncate text-xs text-muted-foreground">{c.external_id || "No external account ID"}</div></div><Badge variant="secondary">{c.environment || "Production"}</Badge>{statusBadge(c.status)}<Link to="/help" search={{ topic: `provider-${c.provider}` }} onClick={(e) => e.stopPropagation()} className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Setup guide</Link><span className="hidden text-xs text-muted-foreground md:block">{relative(c.updated_at)}</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>; })}</div>}</CardContent></Card>
    <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>{selected?.display_name || "Integration details"}</DialogTitle><DialogDescription>Configuration and health for this integration instance.</DialogDescription></DialogHeader>{selected && <div className="space-y-3 text-sm"><div>Platform: <b>{catalog?.providers.find((p) => p.id === selected.provider)?.name}</b></div><div>Environment: <b>{selected.environment}</b></div><div>External account: <b className="break-all">{selected.external_id || "—"}</b></div>{selected.last_error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">{selected.last_error}</div>}<div className="flex items-center gap-2 rounded-md border p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Credentials remain encrypted and server-side.</div></div>}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Close</Button>{selected && <><Button asChild variant="outline"><Link to="/help" search={{ topic: `provider-${selected.provider}` }}>Setup guide</Link></Button><Button variant="destructive" onClick={() => setRemoveTargets([selected])}>Remove integration</Button></>}</DialogFooter></DialogContent></Dialog>
    <AlertDialog open={removeTargets.length > 0} onOpenChange={(o) => !o && setRemoveTargets([])}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove integration?</AlertDialogTitle><AlertDialogDescription>This removes the selected integration and its encrypted credentials.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); void removeConnections(); }} disabled={busy}>{busy ? "Removing…" : "Remove integration"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
