import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, RefreshCw, Search, ShieldAlert, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyIntegrationsState } from "@/components/EmptyIntegrationsState";
import { getInvestigation, getInvestigations, type Investigation, type InvestigationSummary } from "@/lib/investigation.functions";
import { useTenantContext } from "@/lib/tenant";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/investigations")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === "findings" ? "findings" as const : "overview" as const,
    key: typeof search.key === "string" ? search.key : undefined,
    severity: ["critical", "high", "medium", "low"].includes(String(search.severity)) ? String(search.severity) as Severity : undefined,
    provider: typeof search.provider === "string" ? search.provider : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  head: () => pageHead({ path: "/investigations", title: "Vulnerabilities — Aegis AI", description: "Prioritize evidence-backed operational and security vulnerabilities across the enterprise." }),
  component: VulnerabilitiesPage,
});

type Severity = "critical" | "high" | "medium" | "low";
type FindingsFilter = "all" | "active" | "resolved";
const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

function severityClass(severity: string) {
  const value = severity.toLowerCase();
  if (value === "critical") return "border-destructive/40 bg-destructive/5 text-destructive";
  if (value === "high") return "border-warning/40 bg-warning/5 text-warning-foreground";
  if (value === "medium") return "border-info/40 bg-info/5 text-info";
  return "border-muted-foreground/30 bg-muted/40 text-muted-foreground";
}

function severityBarClass(severity: Severity) {
  if (severity === "critical") return "bg-destructive";
  if (severity === "high") return "bg-warning";
  if (severity === "medium") return "bg-info";
  return "bg-muted-foreground/50";
}

function VulnerabilitiesPage() {
  const { view, key, severity, provider, q } = Route.useSearch();
  const navigate = useNavigate();
  const { environmentMode } = useTenantContext();
  const list = useServerFn(getInvestigations);
  const load = useServerFn(getInvestigation);
  const [items, setItems] = useState<Awaited<ReturnType<typeof getInvestigations>> | null>(null);
  const [detail, setDetail] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      if (key) {
        const result = await load({ data: { key } });
        setDetail("unavailable" in result ? null : result);
      } else {
        setDetail(null);
        setItems(await list());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [key]);

  const source = items?.investigations ?? [];
  const openItems = useMemo(() => source.filter((item) => item.severity.toLowerCase() !== "low"), [source]);
  const counts = useMemo(() => ({
    critical: source.filter((item) => item.severity.toLowerCase() === "critical").length,
    high: source.filter((item) => item.severity.toLowerCase() === "high").length,
    medium: source.filter((item) => item.severity.toLowerCase() === "medium").length,
    low: source.filter((item) => item.severity.toLowerCase() === "low").length,
  }), [source]);
  const providers = useMemo(() => Array.from(new Set(source.map((item) => item.provider?.trim()).filter(Boolean) as string[])).sort(), [source]);
  const providerGroups = useMemo(() => providers.map((name) => {
    const rows = openItems.filter((item) => item.provider === name);
    const highest = rows.reduce<Severity | null>((current, item) => {
      const candidate = item.severity.toLowerCase() as Severity;
      return !current || SEVERITY_ORDER.indexOf(candidate) < SEVERITY_ORDER.indexOf(current) ? candidate : current;
    }, null);
    return { name, openCount: rows.length, highest };
  }).filter((group) => group.openCount > 0), [providers, openItems]);

  const filtered = useMemo(() => {
    const normalizedQuery = (q ?? "").trim().toLowerCase();
    return source.filter((item) => {
      const itemSeverity = item.severity.toLowerCase() as Severity;
      const text = `${item.title} ${item.key} ${item.category} ${item.impact} ${item.provider ?? ""}`.toLowerCase();
      return (!normalizedQuery || text.includes(normalizedQuery))
        && (!severity || itemSeverity === severity)
        && (!provider || item.provider === provider);
    }).sort((a, b) => {
      const severityDelta = SEVERITY_ORDER.indexOf(a.severity.toLowerCase() as Severity) - SEVERITY_ORDER.indexOf(b.severity.toLowerCase() as Severity);
      return severityDelta || a.title.localeCompare(b.title);
    });
  }, [source, q, severity, provider]);

  const topFindings = useMemo(() => [...openItems].sort((a, b) => {
    const severityDelta = SEVERITY_ORDER.indexOf(a.severity.toLowerCase() as Severity) - SEVERITY_ORDER.indexOf(b.severity.toLowerCase() as Severity);
    return severityDelta || a.title.localeCompare(b.title);
  }).slice(0, 6), [openItems]);

  const correlated = useMemo(() => [...openItems].filter((item) => item.correlatedChangeCount > 0).sort((a, b) => b.correlatedChangeCount - a.correlatedChangeCount).slice(0, 5), [openItems]);

  const goFindings = (next: { severity?: Severity; provider?: string; q?: string }) => {
    void navigate({ search: (prev) => ({
      ...prev,
      view: "findings",
      key: undefined,
      severity: next.severity,
      provider: next.provider,
      q: next.q,
    }) });
  };

  const clearFilters = () => goFindings({});

  if (loading && !key) return <div className="py-16 text-center text-sm text-muted-foreground">Loading {environmentMode === "demo" ? "demo" : "live"} vulnerabilities…</div>;
  if (loading && key) return <div className="py-16 text-center text-sm text-muted-foreground">Loading finding evidence…</div>;
  if (key && !detail) return <EmptyIntegrationsState title="Vulnerability unavailable" description="The finding is no longer present in current evidence, or evidence is insufficient." />;
  if (detail) return <VulnerabilityDetail data={detail} />;

  if (!items?.connected) {
    return <><PageHeader title="Vulnerabilities" description="Prioritized findings backed by real provider, audit and change evidence." actions={<Button variant="outline" size="sm" onClick={() => void refresh()}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh</Button>} /><EmptyIntegrationsState title="No provider evidence available" description="Connect and synchronize a provider before Aegis can identify vulnerabilities." /></>;
  }

  const hasEvidence = source.length > 0;
  return <div className="w-full space-y-5">
    <PageHeader title="Vulnerabilities" description={items.isDemo ? "Prioritized demo findings for product exploration." : "Prioritized operational and security findings backed by current provider evidence."} actions={<Button variant="outline" size="sm" onClick={() => void refresh()}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh</Button>} />

    {!hasEvidence ? <Card className="border-dashed shadow-none"><CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center"><div className="text-base font-semibold">No operational or security findings in current evidence.</div><p className="mt-1 max-w-lg text-sm text-muted-foreground">Aegis will show findings only when connected provider or operational evidence supports them.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Button asChild><Link to="/integrations/catalog">Connect providers</Link></Button><Button variant="outline" asChild><Link to="/">Open Command Center</Link></Button></div></CardContent></Card> :
      view === "findings"
        ? <FindingsWorkspace items={filtered} total={source.length} providers={providers} query={q ?? ""} severity={severity} provider={provider} onQuery={(value) => goFindings({ severity, provider, q: value || undefined })} onSeverity={(value) => goFindings({ severity: value, provider, q })} onProvider={(value) => goFindings({ severity, provider: value || undefined, q })} onClear={clearFilters} isDemo={items.isDemo} />
        : <OverviewWorkspace source={source} openItems={openItems} counts={counts} providerGroups={providerGroups} topFindings={topFindings} correlated={correlated} isDemo={items.isDemo} onFindings={goFindings} />}
  </div>;
}

function OverviewWorkspace({ source, openItems, counts, providerGroups, topFindings, correlated, isDemo, onFindings }: {
  source: InvestigationSummary[];
  openItems: InvestigationSummary[];
  counts: Record<Severity, number>;
  providerGroups: Array<{ name: string; openCount: number; highest: Severity | null }>;
  topFindings: InvestigationSummary[];
  correlated: InvestigationSummary[];
  isDemo: boolean;
  onFindings: (next: { severity?: Severity; provider?: string; q?: string }) => void;
}) {
  const severityTotal = Math.max(1, source.length);
  const correlationCount = openItems.filter((item) => item.correlatedChangeCount > 0).length;
  return <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <OverviewKpi label="Open critical" value={counts.critical} tone="critical" onClick={() => onFindings({ severity: "critical" })} />
      <OverviewKpi label="Open high" value={counts.high} tone="high" onClick={() => onFindings({ severity: "high" })} />
      <OverviewKpi label="Open medium" value={counts.medium} tone="medium" onClick={() => onFindings({ severity: "medium" })} />
      <OverviewKpi label="Total open findings" value={openItems.length} tone="neutral" onClick={() => onFindings({})} />
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="shadow-none xl:col-span-1">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Findings by severity</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {SEVERITY_ORDER.map((level) => {
            const value = counts[level];
            const width = Math.round((value / severityTotal) * 100);
            return <button key={level} type="button" onClick={() => onFindings({ severity: level })} className="group w-full text-left">
              <div className="mb-1 flex items-center justify-between text-xs"><span className="capitalize">{level}</span><span className="tabular-nums text-muted-foreground">{value}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${severityBarClass(level)}`} style={{ width: `${value ? Math.max(width, 3) : 0}%` }} /></div>
            </button>;
          })}
        </CardContent>
      </Card>

      <Card className="shadow-none xl:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm">Top findings</CardTitle><button type="button" onClick={() => onFindings({})} className="text-xs text-primary hover:underline">View all →</button></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {topFindings.length ? topFindings.map((item) => <Link key={item.key} to="/investigations" search={{ key: item.key }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
              <span className={`h-2 w-2 shrink-0 rounded-full ${severityBarClass(item.severity.toLowerCase() as Severity)}`} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.title}</span><span className="block truncate text-xs text-muted-foreground">{item.provider ?? "Unattributed / workspace"} · {item.category}</span></span>
              <SeverityBadge severity={item.severity} /><span className="hidden text-xs text-muted-foreground sm:inline">{item.confidence}</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>) : <div className="px-4 py-8 text-center text-sm text-muted-foreground">No open findings in current evidence.</div>}
          </div>
        </CardContent>
      </Card>
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="shadow-none xl:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">By provider</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {providerGroups.length ? providerGroups.map((group) => <button key={group.name} type="button" onClick={() => onFindings({ provider: group.name })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30">
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{group.name}</span><span className="text-xs text-muted-foreground">{group.openCount} open finding{group.openCount === 1 ? "" : "s"}</span></span>
              {group.highest ? <SeverityBadge severity={group.highest} /> : null}<ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>) : <div className="px-4 py-8 text-center text-sm text-muted-foreground">No provider-attributed open findings.</div>}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Governance linkage</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold tabular-nums">{correlationCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">open findings with correlated changes</div>
          <div className="mt-4 space-y-2">
            {correlated.length ? correlated.map((item) => <Link key={item.key} to="/investigations" search={{ key: item.key }} className="block rounded-md border px-3 py-2 hover:bg-muted/30"><div className="truncate text-xs font-medium">{item.title}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.correlatedChangeCount} correlated change{item.correlatedChangeCount === 1 ? "" : "s"}</div></Link>) : <div className="text-xs text-muted-foreground">No persisted correlations in current evidence.</div>}
          </div>
        </CardContent>
      </Card>
    </div>

    <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span>{isDemo ? "Seeded demo records · no provider mutation" : "Evidence-backed · no synthetic findings"}</span><button type="button" onClick={() => onFindings({})} className="inline-flex items-center gap-1 text-primary hover:underline">Open findings list<ArrowRight className="h-3.5 w-3.5" /></button></div>
  </div>;
}

function OverviewKpi({ label, value, tone, onClick }: { label: string; value: number; tone: "critical" | "high" | "medium" | "neutral"; onClick: () => void }) {
  const accent = tone === "critical" ? "bg-destructive" : tone === "high" ? "bg-warning" : tone === "medium" ? "bg-info" : "bg-muted-foreground";
  return <button type="button" onClick={onClick} className="group relative overflow-hidden rounded-lg border bg-card p-4 text-left shadow-none transition-colors hover:bg-muted/20"><span className={`absolute inset-y-0 left-0 w-1 ${accent}`} /><div className="flex items-center justify-between gap-3 pl-2"><div><div className="text-3xl font-semibold tabular-nums tracking-tight">{value}</div><div className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div></div><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div></button>;
}

function FindingsWorkspace({ items, total, providers, query, severity, provider, onQuery, onSeverity, onProvider, onClear, isDemo }: {
  items: InvestigationSummary[];
  total: number;
  providers: string[];
  query: string;
  severity?: Severity;
  provider?: string;
  onQuery: (value: string) => void;
  onSeverity: (value?: Severity) => void;
  onProvider: (value?: string) => void;
  onClear: () => void;
  isDemo: boolean;
}) {
  const activeFilter: FindingsFilter = severity === "low" ? "resolved" : severity ? "active" : "all";
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search findings, keys, categories or providers…" className="pl-9" /></div>
      <div className="flex items-center gap-1 rounded-md border p-1">
        {(["all", "active", "resolved"] as FindingsFilter[]).map((value) => <button key={value} type="button" onClick={() => onSeverity(value === "all" ? undefined : value === "resolved" ? "low" : undefined)} className={`rounded px-2.5 py-1.5 text-xs ${activeFilter === value ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}>{value === "all" ? "All" : value === "active" ? "Open" : "Resolved"}</button>)}
      </div>
      <select aria-label="Provider filter" value={provider ?? ""} onChange={(e) => onProvider(e.target.value || undefined)} className="h-9 max-w-[220px] rounded-md border bg-background px-3 text-xs"><option value="">All providers</option>{providers.map((name) => <option key={name} value={name}>{name}</option>)}</select>
      <Button variant="ghost" size="sm" onClick={onClear} disabled={!query && !severity && !provider}>Reset</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{items.length} of {total} findings</Badge>{severity ? <Badge variant="outline" className={severityClass(severity)}>Severity: {severity}</Badge> : null}{provider ? <Badge variant="outline">Provider: {provider}</Badge> : null}{query ? <Badge variant="outline">Search: {query}</Badge> : null}</div>
    <Card className="shadow-none">
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[920px] text-sm">
          <thead><tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground"><th className="px-4 py-2.5">Finding</th><th className="px-3 py-2.5">Severity</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Category</th><th className="px-3 py-2.5">Provider</th><th className="px-3 py-2.5 text-right">Correlated changes</th><th className="px-3 py-2.5">Confidence</th></tr></thead>
          <tbody>
            {items.map((item) => <tr key={item.key} className="border-b last:border-0 hover:bg-muted/20">
              <td className="px-4 py-2.5"><Link to="/investigations" search={{ key: item.key }} className="font-medium text-primary hover:underline">{item.title}</Link><div className="mt-0.5 text-[11px] text-muted-foreground">{item.key}</div></td>
              <td className="px-3 py-2.5"><SeverityBadge severity={item.severity} /></td>
              <td className="px-3 py-2.5"><StatusBadge severity={item.severity} /></td>
              <td className="px-3 py-2.5 text-muted-foreground">{item.category}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{item.provider ?? "Unattributed / workspace"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{item.correlatedChangeCount}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{item.confidence}</td>
            </tr>)}
            {!items.length ? <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">No findings match the current filters.</td></tr> : null}
          </tbody>
        </table>
      </CardContent>
    </Card>
    <div className="text-xs text-muted-foreground">{isDemo ? "Seeded demo records · no provider mutation" : "Evidence-backed · no synthetic findings"}</div>
  </div>;
}

function SeverityBadge({ severity }: { severity: string }) { return <Badge variant="outline" className={severityClass(severity)}>{severity}</Badge>; }
function StatusBadge({ severity }: { severity: string }) { const resolved = severity.toLowerCase() === "low"; return <Badge variant="outline" className={resolved ? "border-success/30 text-success" : "border-warning/40 text-warning-foreground"}>{resolved ? "Resolved" : "Open"}</Badge>; }

function VulnerabilityDetail({ data }: { data: Investigation }) { return <div><PageHeader title={data.title} description={`${data.category} · ${data.provider ?? "Evidence source"}`} actions={<Button variant="outline" asChild><Link to="/investigations" search={{ key: undefined }}><ArrowLeft className="mr-1.5 h-4 w-4" />All vulnerabilities</Link></Button>} /><div className="mb-4 flex flex-wrap gap-2"><SeverityBadge severity={data.severity} /><Badge variant="outline">Risk: {data.risk.tier}</Badge><Badge variant="outline">Confidence: {data.confidence}</Badge><Badge variant="outline" className={data.isDemo ? "border-primary/40 text-primary" : "border-success/30 text-success"}>{data.isDemo ? "Seeded demo records · no provider mutation" : "Live evidence-backed"}</Badge>{data.lastSyncAt && <Badge variant="outline">Last sync {new Date(data.lastSyncAt).toLocaleString()}</Badge>}</div><div className="grid gap-4 xl:grid-cols-3"><Card className="xl:col-span-2"><CardHeader><CardTitle className="text-sm">Details</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 text-sm"><Detail label="Finding" value={data.finding} /><Detail label="Business impact" value={data.businessImpact} /><Detail label="Recommended action" value={data.recommendedAction} /><Detail label="Confidence rationale" value={data.confidenceRationale} /></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Aegis assessment</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Evidence confidence: {data.confidence}</div><p className="text-xs text-muted-foreground">Aegis does not invent a model score; confidence reflects evidence completeness.</p><Button className="w-full" asChild><Link to="/approvals">Open Approval Center</Link></Button></CardContent></Card></div><div className="mt-4 grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">Evidence</CardTitle></CardHeader><CardContent className="space-y-2">{data.evidence.map((item, index) => <div key={`${item.source}-${index}`} className="rounded-md border p-3"><div className="text-sm font-medium">{item.source}</div><div className="mt-1 text-sm text-muted-foreground">{item.observation}</div><div className="mt-1 text-[11px] text-muted-foreground">Observed {new Date(item.observedAt).toLocaleString()}</div></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Timeline</CardTitle></CardHeader><CardContent className="space-y-2">{data.timeline.map((item, index) => <div key={`${item.ts}-${index}`} className="rounded-md border p-3"><div className="flex gap-2 text-sm"><ShieldAlert className="h-4 w-4 text-primary" />{item.text}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.actor} · {new Date(item.ts).toLocaleString()}</div></div>)}</CardContent></Card></div><Card className="mt-4"><CardHeader><CardTitle className="text-sm">Correlated changes</CardTitle></CardHeader><CardContent>{data.correlatedSignals.length ? data.correlatedSignals.map((signal) => <Link key={signal.rowId} to="/approvals/$id" params={{ id: signal.rowId }} className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/30"><span><span className="block text-sm font-medium">{signal.title}</span><span className="text-xs text-muted-foreground">{signal.changeId} · {signal.stage} · {signal.severity}</span></span><span className="text-xs text-primary">Open change →</span></Link>) : <div className="py-6 text-center text-sm text-muted-foreground">No persisted cross-record correlation was found.</div>}</CardContent></Card></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><div className="text-xs font-medium text-muted-foreground">{label}</div><div className="mt-1 leading-6">{value}</div></div>; }