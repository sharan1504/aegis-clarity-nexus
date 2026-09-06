import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, Loader2, Plug, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { updateAgentDataSource } from "@/lib/agent-architecture.functions";
import { deployAgent } from "@/lib/agent-deployment.functions";
import { getAgentsPageData } from "@/lib/agents-page.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/agents")({
  head: () => pageHead({ path: "/agents", title: "AI Agents — Aegis AI", description: "Operate deployed agents and deploy verified agent definitions from one workspace." }),
  loader: () => getAgentsPageData(),
  component: AgentsPage,
});
type Agent = { agent_key: string; display_name: string; description: string | null; category: string | null };
type Binding = { id: string; agent_key: string; enabled: boolean; is_mock: boolean; integration_id: string; capability_id: string };

function AgentsPage() {
  const initial = useLoaderData({ from: "/_app/agents" });
  const updateBinding = useServerFn(updateAgentDataSource); const deploy = useServerFn(deployAgent); const loadPage = useServerFn(getAgentsPageData);
  const [agents, setAgents] = useState<Agent[]>(initial.agents as Agent[]); const [bindings, setBindings] = useState<Binding[]>(initial.bindings as Binding[]); const [query, setQuery] = useState(""); const [loading, setLoading] = useState(false); const [toggling, setToggling] = useState<string | null>(null); const [deploying, setDeploying] = useState<string | null>(null);
  const load = async () => { setLoading(true); try { const result = await loadPage(); setAgents(result.agents as Agent[]); setBindings(result.bindings as Binding[]); } catch (error) { toast.error("Agent configuration could not be loaded", { description: error instanceof Error ? error.message : "Try again." }); } finally { setLoading(false); } };
  const deployedKeys = useMemo(() => new Set(bindings.filter((b) => b.enabled && !b.is_mock).map((b) => b.agent_key)), [bindings]);
  const filtered = useMemo(() => agents.filter((a) => `${a.display_name} ${a.description ?? ""} ${a.category ?? ""}`.toLowerCase().includes(query.toLowerCase())), [agents, query]);
  const toggleAgent = async (agentKey: string, enabled: boolean) => { const rows = bindings.filter((b) => b.agent_key === agentKey); if (!rows.length) { toast.error("Configure a real integration binding before enabling this agent."); return; } setToggling(agentKey); try { for (const row of rows) { const result = await updateBinding({ data: { bindingId: row.id, enabled } }); if (!result.ok) throw new Error(result.errorMessage); } toast.success(enabled ? "Agent enabled" : "Agent disabled"); await load(); } catch (error) { toast.error("Could not change agent state", { description: error instanceof Error ? error.message : "Try again." }); } finally { setToggling(null); } };
  const handleDeploy = async (agentKey: string) => { setDeploying(agentKey); try { const result = await deploy({ data: { agentKey } }); if (!result.ok) { toast.error("Agent could not be deployed", { description: result.error }); return; } toast.success(`${result.displayName} deployed`); await load(); } catch (error) { toast.error("Agent deployment failed", { description: error instanceof Error ? error.message : "Try again." }); } finally { setDeploying(null); } };
  return <div><PageHeader title="AI Agents" description="Operate deployed agents and discover verified definitions without leaving the AI Agents workspace." actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>} />
    <Card className="mb-4"><CardContent className="flex items-center gap-3 py-3"><Search className="h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents, capabilities and definitions…" className="h-9" /><span className="text-xs text-muted-foreground">{filtered.length} definitions</span></CardContent></Card>
    {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading agent configuration…</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((agent) => { const bs = bindings.filter((b) => b.agent_key === agent.agent_key); const real = bs.filter((b) => b.enabled && !b.is_mock); const enabled = bs.some((b) => b.enabled); const hasRealBinding = bs.some((b) => !b.is_mock); const deployed = deployedKeys.has(agent.agent_key); return <Card key={agent.agent_key}><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div><div className="flex items-center gap-2"><Badge variant="outline" className={real.length ? "border-success/40 text-success" : ""}>{real.length ? "Operational" : deployed ? enabled ? "Enabled" : "Disabled" : "Available"}</Badge>{deployed && <Switch checked={enabled} disabled={!hasRealBinding || toggling !== null} aria-label={`${enabled ? "Disable" : "Enable"} ${agent.display_name}`} onCheckedChange={(v) => void toggleAgent(agent.agent_key, v)} />}</div></div><CardTitle className="mt-3 text-base">{agent.display_name}</CardTitle><CardDescription>{agent.description ?? "No description configured."}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="text-xs text-muted-foreground">Category: {agent.category ?? "Uncategorized"}</div><div className="rounded-lg border bg-muted/30 p-3 text-xs">{real.length ? <div className="flex items-center gap-1.5 text-success"><ShieldCheck className="h-3.5 w-3.5" />{real.length} real integration binding{real.length > 1 ? "s" : ""}</div> : bs.length ? <div className="flex items-center gap-1.5 text-muted-foreground"><Plug className="h-3.5 w-3.5" />{bs.length} binding{bs.length > 1 ? "s" : ""}; configure or enable a real source</div> : <div className="flex items-center gap-1.5 text-muted-foreground"><Plug className="h-3.5 w-3.5" />No integration binding</div>}</div><div className="flex gap-2">{deployed ? <Button size="sm" className="flex-1" asChild><Link to="/agent/$agentKey" params={{ agentKey: agent.agent_key }}>View & configure</Link></Button> : <Button size="sm" className="flex-1" disabled={deploying === agent.agent_key} onClick={() => void handleDeploy(agent.agent_key)}>{deploying === agent.agent_key ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Deploying…</> : "Deploy agent"}</Button>}<Button size="sm" variant="ghost" asChild><Link to="/integrations">Integrations</Link></Button></div></CardContent></Card>; })}</div>}
  </div>;
}
