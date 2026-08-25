import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Loader2, Plug, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { updateAgentDataSource } from "@/lib/agent-architecture.functions";
import { useTenantContext } from "@/lib/tenant";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/agents")({ head: () => pageHead({ path: "/agents", title: "AI Agents — Aegis AI", description: "Verified workspace agents and their real integration bindings." }), component: AgentsPage });
type Agent = { agent_key: string; display_name: string; description: string | null; category: string | null };
type Binding = { id: string; agent_key: string; enabled: boolean; is_mock: boolean; integration_id: string; capability_id: string };

function AgentsPage() {
  const { tenantId } = useTenantContext();
  const updateBinding = useServerFn(updateAgentDataSource);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [a, b] = await Promise.all([
      supabase.from("agent_definitions").select("agent_key,display_name,description,category").order("display_name"),
      supabase.from("agent_integration_bindings").select("id,agent_key,enabled,is_mock,integration_id,capability_id").eq("tenant_id", tenantId),
    ]);
    setAgents((a.data ?? []) as Agent[]);
    setBindings((b.data ?? []) as Binding[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [tenantId]);

  const toggleAgent = async (agentKey: string, enabled: boolean) => {
    const rows = bindings.filter((b) => b.agent_key === agentKey);
    if (!rows.length) { toast.error("Configure a real integration binding before enabling this agent."); return; }
    setToggling(agentKey);
    try {
      for (const row of rows) {
        const result = await updateBinding({ data: { bindingId: row.id, enabled } });
        if (!result.ok) throw new Error(result.errorMessage);
      }
      toast.success(enabled ? "Agent enabled" : "Agent disabled");
      await load();
    } catch (error) {
      toast.error("Could not change agent state", { description: error instanceof Error ? error.message : "Try again." });
    } finally { setToggling(null); }
  };

  return <div><PageHeader title="AI Agents" description="Enable or disable each agent and manage its tenant-scoped integration bindings." actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>} />
    {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading real agent configuration…</div> : agents.length === 0 ? <Card><CardContent className="py-16 text-center"><Bot className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-3 font-medium">No agents are configured</div><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Aegis intentionally does not display seeded agents. Configure an agent definition and bind it to a real integration to make it operational.</p><Button className="mt-4" asChild><Link to="/marketplace">Open Agent Catalog</Link></Button></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{agents.map((agent) => {
      const bs = bindings.filter((b) => b.agent_key === agent.agent_key);
      const real = bs.filter((b) => b.enabled && !b.is_mock);
      const enabled = bs.some((b) => b.enabled);
      const hasRealBinding = bs.some((b) => !b.is_mock);
      return <Card key={agent.agent_key}><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div><div className="flex items-center gap-2"><Badge variant="outline" className={real.length ? "border-success/40 text-success" : ""}>{real.length ? "Operational" : enabled ? "Enabled" : "Disabled"}</Badge><Switch checked={enabled} disabled={!hasRealBinding || toggling !== null} aria-label={`${enabled ? "Disable" : "Enable"} ${agent.display_name}`} onCheckedChange={(v) => void toggleAgent(agent.agent_key, v)} /></div></div><CardTitle className="mt-3 text-base">{agent.display_name}</CardTitle><CardDescription>{agent.description ?? "No description configured."}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="text-xs text-muted-foreground">Category: {agent.category ?? "Uncategorized"}</div><div className="rounded-lg border bg-muted/30 p-3 text-xs">{real.length ? <div className="flex items-center gap-1.5 text-success"><ShieldCheck className="h-3.5 w-3.5" /> {real.length} real integration binding{real.length > 1 ? "s" : ""}</div> : bs.length ? <div className="flex items-center gap-1.5 text-muted-foreground"><Plug className="h-3.5 w-3.5" /> {bs.length} binding{bs.length > 1 ? "s" : ""}; configure or enable a real source</div> : <div className="flex items-center gap-1.5 text-muted-foreground"><Plug className="h-3.5 w-3.5" /> No integration binding</div>}</div><div className="flex gap-2"><Button size="sm" className="flex-1" asChild><Link to="/agent/$agentKey" params={{ agentKey: agent.agent_key }}>View & configure</Link></Button><Button size="sm" variant="ghost" asChild><Link to="/integrations">Manage integrations</Link></Button></div></CardContent></Card>;
    })}</div>}
  </div>;
}
