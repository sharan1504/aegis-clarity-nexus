import type { ReactNode } from "react";
import { Activity, Bot, CheckCircle2, Clock3, Coins, ArrowRight, GitBranch, RefreshCw, Users, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Analytics } from "@/routes/_app.analytics.types";

export const PRESETS = [7, 30, 60, 90] as const;

export function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string | number }) {
  return <Card className="border-border/70 bg-card/70 shadow-none"><CardContent className="p-4 lg:p-5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-muted-foreground" /></div><div className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">{value}</div></CardContent></Card>;
}
export function MetricSmall({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>; }
export function EmptyPanel({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <div className="rounded-lg border border-dashed p-8 text-center"><div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /></div><div className="font-medium">{title}</div><div className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{detail}</div>{action ? <div className="mt-4">{action}</div> : null}</div>; }

const agentKeyFor = (data: Analytics, agent: Analytics["agents"][number]) =>
  data.ai.usageDetails.find((row) => row.feature === agent.name)?.agentKey ?? agent.name;

export function OverviewView({ data, max }: { data: Analytics; max: number }) {
  const activeAgents = data.agents.filter((agent) => agent.actions > 0 || agent.changes > 0).slice(0, 4);
  const hasTrendEvidence = data.trends.some((item) => item.events > 0 || item.changes > 0 || item.aiRequests > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Link to="/analytics" search={{ view: "admin-activity" }} className="rounded-lg transition-colors hover:ring-1 hover:ring-primary/30"><Metric icon={Activity} label="Audit events" value={data.platform.totalEvents.toLocaleString()} /></Link>
        <Link to="/analytics" search={{ view: "admin-activity" }} className="rounded-lg transition-colors hover:ring-1 hover:ring-primary/30"><Metric icon={Users} label="Active actors" value={data.platform.activeUsers.toLocaleString()} /></Link>
        <Link to="/analytics" search={{ view: "governance" }} className="rounded-lg transition-colors hover:ring-1 hover:ring-primary/30"><Metric icon={GitBranch} label="Change records" value={data.platform.changeRecords.toLocaleString()} /></Link>
        <Link to="/analytics" search={{ view: "ai-usage" }} className="rounded-lg transition-colors hover:ring-1 hover:ring-primary/30"><Metric icon={Bot} label="AI requests" value={data.ai.requests.toLocaleString()} /></Link>
        <Link to="/analytics" search={{ view: "ai-usage" }} className="rounded-lg transition-colors hover:ring-1 hover:ring-primary/30"><Metric icon={Clock3} label="Avg AI latency" value={`${data.ai.averageLatencyMs} ms`} /></Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.8fr)]">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Operational trend</CardTitle>
            <div className="text-xs text-muted-foreground">Daily evidence volume across audit events, change records and AI usage.</div>
          </CardHeader>
          <CardContent>
            {hasTrendEvidence ? (
              <>
                <div className="flex h-52 items-end gap-1 rounded-lg bg-muted/[0.08] px-2 py-3">
                  {data.trends.map((item) => {
                    const value = item.events + item.changes + item.aiRequests;
                    return <div key={item.date} className="flex h-full flex-1 items-end" title={`${item.date}: ${value} records`}><div className="w-full rounded-t bg-primary/70 transition-opacity hover:opacity-80" style={{ height: `${Math.max(2, (value / max) * 100)}%` }} /></div>;
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{data.period.from.slice(0, 10)}</span><span>{data.period.to.slice(0, 10)}</span></div>
              </>
            ) : (
              <EmptyPanel
                title="No operational evidence in this range"
                detail="Audit events, change records and AI usage depend on tenant-scoped rows being recorded in the selected period."
                action={<><Link to="/integrations"><Button size="sm" variant="outline">Connect providers</Button></Link><Link to="/"><Button size="sm" variant="outline">Open Command Center</Button></Link></>}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/70 shadow-none">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Governance posture</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <MetricSmall label="Pending changes" value={data.platform.pendingChanges} />
              <MetricSmall label="Critical changes" value={data.severityCounts.critical ?? 0} />
              <MetricSmall label="Roles represented" value={data.platform.connectedRoles} />
              <MetricSmall label="Users in tenant" value={data.platform.totalUsers} />
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-none">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Top active agents</CardTitle></CardHeader>
            <CardContent>
              {activeAgents.length ? (
                <div className="space-y-1.5">
                  {activeAgents.map((agent) => (
                    <Link key={agent.name} to="/analytics" search={{ view: "agents", agentKey: agentKeyFor(data, agent) }} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/[0.08] px-3 py-2 transition-colors hover:border-primary/30 hover:bg-muted/30">
                      <div className="min-w-0"><div className="truncate text-sm font-medium text-primary">{agent.name}</div><div className="text-[11px] text-muted-foreground">{agent.category}</div></div>
                      <div className="text-right text-xs text-muted-foreground"><div className="font-medium text-foreground">{agent.actions + agent.changes}</div><div>actions + changes</div></div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyPanel title="No agent activity in this range" detail="Agents appear here only when real change or AI usage evidence is recorded." />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/70 bg-muted/[0.04] shadow-none">
        <CardHeader className="pb-1"><CardTitle className="text-sm">Evidence notes</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground"><p>Values are derived from tenant-scoped analytics evidence or the report workspace service.</p><p>Empty windows remain zero rather than being replaced by synthetic activity.</p></CardContent>
      </Card>
    </div>
  );
}

export function AiUsageView({ data }: { data: Analytics }) {
  if (!data.ai.requests) return <EmptyPanel title="No AI usage events in this range" detail="AI metrics appear when ai_usage_events contains tenant-scoped records inside the selected range." />;
  const byFeature = new Map<string, { requests: number; tokens: number; cost: number; latency: number }>();
  for (const row of data.ai.usageDetails) { const current = byFeature.get(row.feature) ?? { requests: 0, tokens: 0, cost: 0, latency: 0 }; current.requests += 1; current.tokens += row.totalTokens; current.cost += row.costEstimate; current.latency += row.latencyMs; byFeature.set(row.feature, current); }
  return <div className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Metric icon={Zap} label="Requests" value={data.ai.requests.toLocaleString()} /><Metric icon={Coins} label="Input tokens" value={data.ai.inputTokens.toLocaleString()} /><Metric icon={Coins} label="Output tokens" value={data.ai.outputTokens.toLocaleString()} /><Metric icon={Coins} label="Total tokens" value={data.ai.totalTokens.toLocaleString()} /><Metric icon={Clock3} label="Avg latency" value={`${data.ai.averageLatencyMs} ms`} /></div><Card className="border-border/70 shadow-none"><CardHeader><CardTitle className="text-sm">Usage by feature / agent</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/20 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Feature</th><th className="px-3 py-3 text-right">Requests</th><th className="px-3 py-3 text-right">Tokens</th><th className="px-3 py-3 text-right">Estimated cost</th><th className="px-3 py-3 text-right">Avg latency</th></tr></thead><tbody>{[...byFeature.entries()].map(([feature, row]) => <tr key={feature} className="border-t"><td className="px-4 py-3 font-medium">{feature}</td><td className="px-3 py-3 text-right">{row.requests}</td><td className="px-3 py-3 text-right">{row.tokens.toLocaleString()}</td><td className="px-3 py-3 text-right">{row.cost.toFixed(6)}</td><td className="px-3 py-3 text-right">{Math.round(row.latency / row.requests)} ms</td></tr>)}</tbody></table></CardContent></Card></div>;
}

export function AgentsView({ data, agent: agentKey }: { data: Analytics; agent?: string }) {
  const rows = data.agents.filter((agent) => agent.actions > 0 || agent.changes > 0);
  if (!rows.length) return <EmptyPanel title="No agent activity in this range" detail="Agents are listed only when their catalogue entry has real change or AI usage evidence in the selected period." />;
  const focused = agentKey ? rows.find((agent) => agentKeyFor(data, agent) === agentKey) : null;
  return <div className="space-y-4">
    {focused ? <Card className="border-primary/30 bg-primary/[0.03] shadow-none"><CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{focused.name}</CardTitle><div className="mt-1 text-xs text-muted-foreground">{focused.category} · evidence-focused detail</div></div><Link to="/analytics" search={{ view: "agents" }} className="text-xs text-muted-foreground hover:text-foreground">Clear focus</Link></div></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><MetricSmall label="Actions" value={focused.actions} /><MetricSmall label="Changes" value={focused.changes} /><MetricSmall label="Tokens" value={focused.tokens.toLocaleString()} /><MetricSmall label="Avg latency" value={focused.averageLatencyMs ? `${focused.averageLatencyMs} ms` : "—"} /><MetricSmall label="Last activity" value={focused.lastActivity ? new Date(focused.lastActivity).toLocaleString() : "No activity"} />{focused.recentChanges.length ? <div className="sm:col-span-2 lg:col-span-5 border-t pt-3"><div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recent changes</div><div className="grid gap-1.5 md:grid-cols-2">{focused.recentChanges.slice(0, 6).map((change) => <div key={change.id} className="rounded-md border bg-background/60 px-3 py-2 text-xs"><div className="font-medium">{String(change.stage ?? "Unknown")}</div><div className="mt-0.5 text-muted-foreground">{String(change.severity ?? "Unknown")} · {new Date(change.createdAt).toLocaleString()}</div></div>)}</div></div> : null}</CardContent></Card> : agentKey ? <EmptyPanel title="Agent evidence not found" detail="The selected agent is not present in the current evidence range." action={<Link to="/analytics" search={{ view: "agents" }}><Button size="sm" variant="outline">Clear focus</Button></Link>} /> : null}
    <Card className="border-border/70 shadow-none"><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[860px] text-sm"><thead className="bg-muted/20 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Agent</th><th className="px-3 py-3 text-left">Category</th><th className="px-3 py-3 text-right">Actions</th><th className="px-3 py-3 text-right">Changes</th><th className="px-3 py-3 text-right">Tokens</th><th className="px-3 py-3 text-right">Avg latency</th><th className="px-3 py-3 text-left">Last activity</th></tr></thead><tbody>{rows.map((agent) => <tr key={agent.name} className={`border-t ${agentKeyFor(data, agent) === agentKey ? "bg-primary/[0.04]" : ""}`}><td className="px-4 py-3 font-medium"><Link to="/analytics" search={{ view: "agents", agentKey: agentKeyFor(data, agent) }} className="text-primary hover:underline">{agent.name}</Link></td><td className="px-3 py-3"><Badge variant="outline">{agent.category}</Badge></td><td className="px-3 py-3 text-right">{agent.actions}</td><td className="px-3 py-3 text-right">{agent.changes}</td><td className="px-3 py-3 text-right">{agent.tokens.toLocaleString()}</td><td className="px-3 py-3 text-right">{agent.averageLatencyMs ? `${agent.averageLatencyMs} ms` : "—"}</td><td className="px-3 py-3 text-xs text-muted-foreground">{agent.lastActivity ? new Date(agent.lastActivity).toLocaleString() : "No activity"}</td></tr>)}</tbody></table></CardContent></Card>
  </div>;
}

export function GovernanceView({ data }: { data: Analytics }) { const stages = new Map<string, { count: number; critical: number; high: number }>(); for (const agent of data.agents) for (const row of agent.recentChanges) { const stage = String(row.stage ?? "Unknown"); const current = stages.get(stage) ?? { count: 0, critical: 0, high: 0 }; current.count += 1; current.critical += String(row.severity).toLowerCase() === "critical" ? 1 : 0; current.high += String(row.severity).toLowerCase() === "high" ? 1 : 0; stages.set(stage, current); } if (!stages.size) return <EmptyPanel title="No change records in this range" detail="Governance analytics are derived from tenant-scoped change_records rows." />; return <div className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><MetricSmall label="Change records" value={data.platform.changeRecords} /><MetricSmall label="Pending review" value={data.platform.pendingChanges} /><MetricSmall label="Critical changes" value={data.severityCounts.critical ?? 0} /></div><Card className="border-border/70 shadow-none"><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/20 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Stage</th><th className="px-3 py-3 text-right">Records</th><th className="px-3 py-3 text-right">Critical</th><th className="px-3 py-3 text-right">High</th><th className="px-3 py-3">Review</th></tr></thead><tbody>{[...stages.entries()].map(([stage, row]) => <tr key={stage} className="border-t"><td className="px-4 py-3 font-medium">{stage}</td><td className="px-3 py-3 text-right">{row.count}</td><td className="px-3 py-3 text-right">{row.critical}</td><td className="px-3 py-3 text-right">{row.high}</td><td className="px-3 py-3">{["Owner Review", "Team Approvals", "Ready to Execute"].includes(stage) ? <Link to="/approvals" className="inline-flex items-center gap-1 text-primary hover:underline">Approval Center<ArrowRight className="h-3.5 w-3.5" /></Link> : <span className="text-muted-foreground">—</span>}</td></tr>)}</tbody></table></CardContent></Card></div>; }

export function AdminActivityView({ data }: { data: Analytics }) { const actorRows = data.recentEvents.filter((row) => row.actor_email).slice(0, 100); if (!data.userActivity.additions && !data.userActivity.removals && !data.userActivity.updates && !actorRows.length) return <EmptyPanel title="No administrative activity in this range" detail="User additions, removals, updates and actor events are based on recorded audit telemetry." />; return <div className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric icon={Users} label="Additions" value={data.userActivity.additions} /><Metric icon={Users} label="Removals" value={data.userActivity.removals} /><Metric icon={Users} label="Updates" value={data.userActivity.updates} /><Metric icon={Activity} label="Unique actors" value={data.userActivity.uniqueActors} /></div><Card className="border-border/70 shadow-none"><CardHeader><CardTitle className="text-sm">Recent actor events</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[800px] text-sm"><thead className="bg-muted/20 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Time</th><th className="px-3 py-3 text-left">Actor</th><th className="px-3 py-3 text-left">Action</th><th className="px-3 py-3 text-left">Entity</th></tr></thead><tbody>{actorRows.map((row, index) => <tr key={`${row.created_at}-${index}`} className="border-t"><td className="px-4 py-3 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td><td className="px-3 py-3">{row.actor_email}</td><td className="px-3 py-3">{row.action}</td><td className="px-3 py-3 text-muted-foreground">{row.entity_type} · {row.entity_id}</td></tr>)}</tbody></table></CardContent></Card></div>; }

export function IntegrationsEvidenceView({ workspace, provider: providerId, busy, onSync }: { workspace: any; provider?: string; busy: string | null; onSync: (provider: string, connectionId: string) => void }) { if (!workspace.providers.connectedProviders.length) return <EmptyPanel title="No connected providers with evidence" detail="Connect and successfully synchronize a provider to see integration evidence here." action={<Link to="/integrations"><Button size="sm">Open Integrations</Button></Link>} />; const focusedProvider = providerId ? workspace.providers.connectedProviders.find((connection: any) => connection.id === providerId) : null;
  return <div className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><MetricSmall label="Connected providers" value={workspace.providers.connectedProviders.length} /><MetricSmall label="Live entity records" value={workspace.providers.entities.length} /><MetricSmall label="Recent sync runs" value={workspace.providers.runs.length} /></div>{focusedProvider ? <Card className="border-primary/30 bg-primary/[0.03] shadow-none"><CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{focusedProvider.display_name ?? focusedProvider.provider}</CardTitle><div className="mt-1 text-xs text-muted-foreground">Focused integration evidence</div></div><Link to="/analytics" search={{ view: "integrations-evidence" }} className="text-xs text-muted-foreground hover:text-foreground">Clear focus</Link></div></CardHeader><CardContent className="grid gap-2 sm:grid-cols-3"><MetricSmall label="Records" value={workspace.providers.entities.filter((entity: any) => entity.connection_id === focusedProvider.id).length} /><MetricSmall label="Last sync" value={focusedProvider.last_sync_at ? new Date(focusedProvider.last_sync_at).toLocaleString() : "Not synced"} /><MetricSmall label="Provider" value={focusedProvider.provider} /></CardContent></Card> : null}<Card className="border-border/70 shadow-none"><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[820px] text-sm"><thead className="bg-muted/20 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Provider</th><th className="px-3 py-3 text-left">Status</th><th className="px-3 py-3 text-right">Records</th><th className="px-3 py-3 text-left">Last sync</th><th className="px-3 py-3">Action</th></tr></thead><tbody>{workspace.providers.connectedProviders.map((connection: any) => { const count = workspace.providers.entities.filter((entity: any) => entity.connection_id === connection.id).length; const latest = workspace.providers.runs.find((run: any) => run.connection_id === connection.id); return <tr key={connection.id} className={`border-t ${connection.id === providerId ? "bg-primary/[0.04]" : ""}`}><td className="px-4 py-3 font-medium"><Link to="/analytics" search={{ view: "integrations-evidence", provider: connection.id }} className="text-primary hover:underline">{connection.display_name ?? connection.provider}</Link></td><td className="px-3 py-3"><Badge variant="outline" className="border-success/30 text-success">Connected</Badge></td><td className="px-3 py-3 text-right">{count}</td><td className="px-3 py-3 text-xs text-muted-foreground">{connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "Not synced"}{latest?.status === "failed" ? <span className="ml-2 text-destructive">Last run failed</span> : null}</td><td className="px-3 py-3"><Button size="sm" variant="outline" disabled={busy === connection.id || !["github", "jira", "slack"].includes(connection.provider)} onClick={() => onSync(connection.provider, connection.id)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Sync</Button></td></tr>; })}</tbody></table></CardContent></Card></div>; }
