import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Plug, RefreshCw, Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { deployAgent } from "@/lib/agent-deployment.functions";
import { useTenantContext } from "@/lib/tenant";
import { pageHead } from "@/lib/seo";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/marketplace")({ head: () => pageHead({ path: "/marketplace", title: "Agent Catalog — Aegis AI", description: "Discover verified agent definitions that are not yet deployed in this workspace." }), component: MarketplacePage });

type AgentRow = { agent_key: string; display_name: string; description: string | null; category: string | null };
type BindingRow = { agent_key: string; enabled: boolean; is_mock: boolean };

function MarketplacePage() {
  const { tenantId } = useTenantContext();
  const navigate = useNavigate();
  const deploy = useServerFn(deployAgent);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [bindings, setBindings] = useState<BindingRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [a, b] = await Promise.all([
      supabase.from("agent_definitions").select("agent_key,display_name,description,category").order("display_name"),
      supabase.from("agent_integration_bindings").select("agent_key,enabled,is_mock").eq("tenant_id", tenantId),
    ]);
    setAgents((a.data ?? []) as AgentRow[]);
    setBindings((b.data ?? []) as BindingRow[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [tenantId]);

  const deployedKeys = useMemo(() => new Set(bindings.filter((b) => b.enabled && !b.is_mock).map((b) => b.agent_key)), [bindings]);
  const filtered = useMemo(() => agents
    .filter((a) => !deployedKeys.has(a.agent_key))
    .filter((a) => `${a.display_name} ${a.description ?? ""} ${a.category ?? ""}`.toLowerCase().includes(query.toLowerCase())), [agents, deployedKeys, query]);

  const handleDeploy = async (agentKey: string) => {
    setDeploying(agentKey);
    try {
      const result = await deploy({ data: { agentKey } });
      if (!result.ok) { toast.error("Agent could not be deployed", { description: result.error }); return; }
      toast.success(`${result.displayName} deployed`, { description: `${result.bindingCount} real integration binding(s) created.` });
      await navigate({ to: "/agents" });
    } catch (error) {
      toast.error("Agent deployment failed", { description: error instanceof Error ? error.message : "Please try again." });
    } finally { setDeploying(null); }
  };

  return <div>
    <PageHeader title="Agent Marketplace" description="Verified agent definitions available for deployment. Live workspace agents are shown only in AI Agents." actions={<Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>} />
    <Card className="mb-4"><CardContent className="flex items-center gap-3 py-3"><Search className="h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search available agent definitions…" className="h-9" /><span className="text-xs text-muted-foreground">{filtered.length} available</span></CardContent></Card>
    {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading verified agent definitions…</div> : filtered.length === 0 ? <Card><CardContent className="py-16 text-center"><Bot className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-3 font-medium">No undeployed agent definitions</div><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Every available definition is already deployed, or no definitions exist yet. Nothing is fabricated to fill the catalog.</p><Button className="mt-4" size="sm" asChild><Link to="/agents">Open AI Agents</Link></Button></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((agent) => <Card key={agent.agent_key}><CardHeader><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div><Badge variant="outline">Available</Badge></div><CardTitle className="mt-3 text-base">{agent.display_name}</CardTitle><CardDescription>{agent.description ?? "No description configured."}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="text-xs text-muted-foreground">Category: {agent.category ?? "Uncategorized"}</div><div className="rounded-md border bg-muted/30 p-3 text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><Plug className="h-3.5 w-3.5" /> Deployment requires a connected real provider with an implemented capability.</span></div><div className="flex gap-2"><Button size="sm" className="flex-1" disabled={deploying === agent.agent_key} onClick={() => void handleDeploy(agent.agent_key)}>{deploying === agent.agent_key ? "Deploying…" : "Deploy"}</Button><Button size="sm" variant="ghost" asChild><Link to="/integrations">Integrations</Link></Button></div></CardContent></Card>)}</div>}
  </div>;
}
