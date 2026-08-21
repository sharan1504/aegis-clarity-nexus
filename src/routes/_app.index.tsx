import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Users, Workflow } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/AppLayout";
import { EmptyIntegrationsState } from "@/components/EmptyIntegrationsState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createLiveRecommendationApproval, getLiveWorkspaceData, type LiveWorkspaceData } from "@/lib/live-workspace.functions";
import { getOnboardingStatus } from "@/lib/onboarding.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/")({ head: () => pageHead({ path: "/", title: "Operations Dashboard — Aegis AI", description: "Live enterprise operations dashboard powered by connected systems." }), component: DashboardPage });

function DashboardPage() {
  const load = useServerFn(getLiveWorkspaceData);
  const createApproval = useServerFn(createLiveRecommendationApproval);
  const loadOnboarding = useServerFn(getOnboardingStatus);
  const navigate = useNavigate();
  const [data, setData] = useState<LiveWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ providerCount: number; deployedAgentCount: number; guardrailCount: number } | null>(null);
  const [setupOpen, setSetupOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      try {
        const [liveData, onboarding] = await Promise.all([load(), loadOnboarding()]);
        if (!cancelled) { setData(liveData); setSetup(onboarding); }
      } catch (error) {
        if (!cancelled) toast.error("Live dashboard unavailable", { description: error instanceof Error ? error.message : "Try again." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    const id = window.setInterval(() => void refresh(), 60000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [load, loadOnboarding]);

  const requestApproval = async (recommendation: LiveWorkspaceData["recommendations"][number]) => { if (!data) return; setBusy(recommendation.key); try { const result = await createApproval({ data: { recommendation, snapshot: data } }); toast.success(`${result.changeId} created`, { description: "Opening Approval Center for review." }); navigate({ to: "/approvals", search: { stage: "all", risk: "all", mode: "all", team: "all", q: result.changeId, sort: "id", dir: "asc" } }); } catch (error) { toast.error("Could not create approval", { description: error instanceof Error ? error.message : "Try again." }); } finally { setBusy(null); } };
  const setupComplete = Boolean(setup && setup.providerCount > 0 && setup.deployedAgentCount > 0 && setup.guardrailCount > 0);
  const showSetup = Boolean(setup && setup.providerCount === 0 && setup.deployedAgentCount === 0 && !setupComplete);
  return <div><PageHeader title="AI Operations Dashboard" description="Live telemetry, evidence-backed recommendations and human approval — no demo metrics." actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => window.location.reload()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button><Button size="sm" asChild><Link to="/chat">Ask Aegis</Link></Button></div>} />
    {showSetup && setupOpen && <Card className="mb-4 border-primary/30"><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">Get Aegis ready</CardTitle><CardDescription>This checklist is based only on your workspace's real configuration.</CardDescription></div><Button size="sm" variant="ghost" onClick={() => setSetupOpen(false)}>Collapse</Button></div></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">{[{ done: setup.providerCount > 0, title: "Connect a provider", to: "/integrations" as const, description: "Connect a real enterprise system." }, { done: setup.deployedAgentCount > 0, title: "Deploy an agent", to: "/agents" as const, description: "Deploy a real tenant-scoped agent." }, { done: setup.guardrailCount > 0, title: "Configure a guardrail", to: "/settings" as const, description: "Set an actual safety policy." }].map((step, index) => <Link key={step.title} to={step.to} className="rounded-lg border p-4 transition-colors hover:bg-muted/40"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border">{step.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : index + 1}</span><div><div className="text-sm font-medium">{step.title}</div><div className="mt-1 text-xs text-muted-foreground">{step.description}</div></div></div></Link>)}</CardContent></Card>}
    {loading && !data ? <div className="py-16 text-center text-sm text-muted-foreground">Loading live connected data…</div> : !data?.connected ? <EmptyIntegrationsState title="Connect Genesys to activate the live dashboard" description="The dashboard intentionally shows no invented metrics. Connect a supported integration and its real telemetry will appear here." /> : <>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline" className="gap-1.5 border-success/40 text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Live</Badge><span>{data.orgName ?? "Genesys Cloud"}</span><span>•</span><span>{data.region}</span><span>•</span><span>Fetched {new Date(data.fetchedAt).toLocaleTimeString()}</span><span>•</span><span>Connector is read-only</span></div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5"><Kpi icon={Users} label="Genesys users" value={data.users} /><Kpi icon={Activity} label="Active users" value={data.activeUsers} /><Kpi icon={ShieldCheck} label="Licensed users" value={data.licensedUsers} /><Kpi icon={Workflow} label="License assignments" value={data.licenseAssignments} /><Kpi icon={Clock3} label="Queues" value={data.queues} /></div>
      <div className="mt-6 grid gap-4 xl:grid-cols-3"><Card className="xl:col-span-2"><CardHeader><div className="flex items-center justify-between"><div><CardTitle className="text-base">Live operational snapshot</CardTitle><CardDescription>Derived directly from the current Genesys API response.</CardDescription></div><Badge variant="outline">{data.healthStatus ?? "unknown"}</Badge></div></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Snapshot label="License types" value={data.licenseTypes} /><Snapshot label="Multiple-license users" value={data.multipleLicenseUsers} /><Snapshot label="90+ day inactive licensed users" value={data.inactiveLicensedUsers} /><Snapshot label="Empty queues" value={data.emptyQueues} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Data freshness</CardTitle><CardDescription>Source health and sync state</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> Direct Genesys API read</div><div className="text-xs text-muted-foreground">Last persisted sync: {data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString() : "Not available"}</div><div className="text-xs text-muted-foreground">Live fetch: {new Date(data.fetchedAt).toLocaleString()}</div></CardContent></Card></div>
      <Card className="mt-6"><CardHeader><div className="flex items-center justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4 text-primary" /> Live recommendations</CardTitle><CardDescription>Only evidence-backed recommendations from the connected Genesys data.</CardDescription></div><Button size="sm" variant="outline" asChild><Link to="/approvals" search={{ stage: "all", risk: "all", mode: "all", team: "all", q: "", sort: "id", dir: "asc" }}>Approval Center</Link></Button></div></CardHeader><CardContent className="space-y-3">{data.recommendations.length ? data.recommendations.map(r => <div key={r.key} className="rounded-lg border p-4"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Badge variant="outline" className={r.severity === "high" ? "border-warning/40 text-warning-foreground" : ""}>{r.severity}</Badge><span className="text-sm font-semibold">{r.title}</span></div><p className="mt-2 text-sm text-muted-foreground">{r.evidence}</p><p className="mt-2 text-xs"><span className="font-medium">Recommendation:</span> {r.action}</p></div><div className="shrink-0 text-right"><div className="text-xs text-muted-foreground">Impact</div><div className="text-sm font-medium">{r.impact}</div></div></div><div className="mt-3 flex items-center justify-between gap-3 border-t pt-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Human approval required</div><Button size="sm" onClick={() => void requestApproval(r)} disabled={busy === r.key}>{busy === r.key ? "Creating…" : "Create approval"}</Button></div></div>) : <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No evidence-backed recommendation is currently available. This is intentional — Aegis does not invent actions when the live data does not support one.</div>}</CardContent></Card>
    </>}
  </div>;
}
function Kpi({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) { return <Card><CardContent className="p-4"><Icon className="h-4 w-4 text-muted-foreground" /><div className="mt-2 text-2xl font-semibold">{value.toLocaleString()}</div><div className="text-xs text-muted-foreground">{label}</div></CardContent></Card>; }
function Snapshot({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value.toLocaleString()}</div></div>; }
