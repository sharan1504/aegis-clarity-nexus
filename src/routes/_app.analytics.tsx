import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Bot, Clock3, Coins, RefreshCw, Settings2, Users, Zap } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, StatusPill } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { getAnalytics, updateAnalyticsSettings } from "@/lib/analytics.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/analytics")({
  head: () => pageHead({ path: "/analytics", title: "Analytics — Aegis AI", description: "Real tenant activity, platform usage, agent utilization, AI token usage, user lifecycle and governance analytics." }),
  component: AnalyticsPage,
});

type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

function AnalyticsPage() {
  const load = useServerFn(getAnalytics);
  const save = useServerFn(updateAnalyticsSettings);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serviceSeconds, setServiceSeconds] = useState("30");
  const [servicePercent, setServicePercent] = useState("80");
  const [disconnectWindow, setDisconnectWindow] = useState("30");
  const [retention, setRetention] = useState("90");
  const [masking, setMasking] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await load();
      setData(result);
      setServiceSeconds(String(result.governance.serviceLevel.targetSeconds));
      setServicePercent(String(result.governance.serviceLevel.targetPercent));
      setDisconnectWindow(String(result.governance.disconnectMetricWindowMinutes));
      setRetention(String(result.governance.retentionDays));
      setMasking(Boolean(result.governance.dataMasking));
    } catch (error) { toast.error("Analytics could not be loaded", { description: error instanceof Error ? error.message : "Try again." }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await save({ data: { serviceLevel: { targetSeconds: Number(serviceSeconds), targetPercent: Number(servicePercent) }, dataMasking: masking, disconnectMetricWindowMinutes: Number(disconnectWindow), retentionDays: Number(retention) } });
      toast.success("Analytics settings saved");
      await refresh();
    } catch (error) { toast.error("Could not save analytics settings", { description: error instanceof Error ? error.message : "Try again." }); }
    finally { setSaving(false); }
  };

  return <div>
    <PageHeader title="Analytics" description="Real workspace telemetry only. Metrics are tenant-scoped and refresh from the connected data layer." actions={<Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>} />
    {loading && !data ? <div className="py-16 text-center text-sm text-muted-foreground">Loading real analytics…</div> : data ? <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Metric icon={Activity} label="Platform events" value={data.platform.totalEvents.toLocaleString()} />
        <Metric icon={Users} label="Active users" value={`${data.platform.activeUsers} / ${data.platform.totalUsers}`} />
        <Metric icon={Zap} label="Pending changes" value={String(data.platform.pendingChanges)} />
        <Metric icon={Coins} label="AI tokens" value={data.ai.totalTokens.toLocaleString()} />
        <Metric icon={Clock3} label="AI latency" value={`${data.ai.averageLatencyMs} ms`} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base">Agent utilization</CardTitle><CardDescription>Separate usage for every known agent, based on real change and AI telemetry.</CardDescription></CardHeader><CardContent className="space-y-2">{data.agents.length ? data.agents.map((agent) => <div key={agent.name} className="flex items-center gap-3 rounded-lg border p-3"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10"><Bot className="h-4 w-4 text-primary" /></div><div className="min-w-0 flex-1"><div className="font-medium">{agent.name}</div><div className="text-xs text-muted-foreground">{agent.category}</div></div><div className="text-right text-xs"><div className="font-medium">{agent.actions} AI requests</div><div className="text-muted-foreground">{agent.changes} change records · {agent.tokens.toLocaleString()} tokens</div></div></div>) : <Empty text="No agent telemetry has been recorded yet." />}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">User lifecycle</CardTitle><CardDescription>Last 30 days</CardDescription></CardHeader><CardContent className="space-y-4"><Stat label="Added / invited" value={data.userActivity.additions} /><Stat label="Updated" value={data.userActivity.updates} /><Stat label="Removed" value={data.userActivity.removals} /><Separator /><Stat label="Unique active actors" value={data.userActivity.uniqueActors} /></CardContent></Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">AI token usage</CardTitle><CardDescription>Actual model usage recorded by Aegis AI calls.</CardDescription></CardHeader><CardContent className="grid grid-cols-3 gap-3"><Usage label="Requests" value={data.ai.requests} /><Usage label="Input" value={data.ai.inputTokens} /><Usage label="Output" value={data.ai.outputTokens} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Recent user/platform activity</CardTitle><CardDescription>Immutable audit events from this workspace.</CardDescription></CardHeader><CardContent className="space-y-2">{data.recentEvents.slice(0, 8).map((event: any, i: number) => <div key={`${event.created_at}-${i}`} className="flex justify-between gap-3 rounded border p-2 text-xs"><div><div className="font-medium">{event.action}</div><div className="text-muted-foreground">{event.actor_email ?? "system"} · {event.entity_type}</div></div><div className="shrink-0 text-muted-foreground">{new Date(event.created_at).toLocaleString()}</div></div>)}</CardContent></Card>
      </div>

      <Card className="mt-6"><CardHeader><div className="flex items-center gap-2"><Settings2 className="h-4 w-4" /><CardTitle className="text-base">Analytics settings</CardTitle></div><CardDescription>Governance controls used when calculating operational metrics.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2"><Label>Service level target (seconds)</Label><Input type="number" min="1" value={serviceSeconds} onChange={(e) => setServiceSeconds(e.target.value)} /></div><div className="space-y-2"><Label>Service level target (%)</Label><Input type="number" min="1" max="100" value={servicePercent} onChange={(e) => setServicePercent(e.target.value)} /></div><div className="space-y-2"><Label>Time used to calculate disconnect metrics (minutes)</Label><Input type="number" min="1" max="240" value={disconnectWindow} onChange={(e) => setDisconnectWindow(e.target.value)} /></div><div className="space-y-2"><Label>Analytics retention (days)</Label><Input type="number" min="7" value={retention} onChange={(e) => setRetention(e.target.value)} /></div><div className="md:col-span-2 xl:col-span-4 flex items-center justify-between rounded-lg border p-3"><div><div className="text-sm font-medium">Data masking</div><div className="text-xs text-muted-foreground">Mask names, emails and identifiers in analytics views where possible.</div></div><Switch checked={masking} onCheckedChange={setMasking} /></div><div className="md:col-span-2 xl:col-span-4 flex justify-end"><Button onClick={() => void saveSettings()} disabled={saving}>{saving ? "Saving…" : "Save analytics settings"}</Button></div></CardContent></Card>
    </> : null}
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) { return <Card><CardContent className="p-4"><Icon className="h-4 w-4 text-muted-foreground" /><div className="mt-2 text-xl font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></CardContent></Card>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value.toLocaleString()}</span></div>; }
function Usage({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{value.toLocaleString()}</div></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>; }
