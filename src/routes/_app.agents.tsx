import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Plug, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/lib/tenant";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/agents")({ head: () => pageHead({ path: "/agents", title: "AI Agents — Aegis AI", description: "Verified workspace agents and their real integration bindings." }), component: AgentsPage });
type Agent = { agent_key: string; display_name: string; description: string | null; category: string | null };
type Binding = { agent_key: string; enabled: boolean; is_mock: boolean; integration_id: string; capability_id: string };

function AgentsPage() {
  const { tenantId } = useTenantContext(); const [agents, setAgents] = useState<Agent[]>([]); const [bindings, setBindings] = useState<Binding[]>([]); const [loading, setLoading] = useState(true);
  const load = async () => { if (!tenantId) return; setLoading(true); const [a, b] = await Promise.all([supabase.from("agent_definitions").select("agent_key,display_name,description,category").order("display_name"), supabase.from("agent_integration_bindings").select("agent_key,enabled,is_mock,integration_id,capability_id").eq("tenant_id", tenantId)]); setAgents((a.data ?? []) as Agent[]); setBindings((b.data ?? []) as Binding[]); setLoading(false); };
  useEffect(() => { void load(); }, [tenantId]);
  return <div><PageHeader title="AI Agents" description="Only agents defined in the real workspace configuration are shown." actions={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>} />
    {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading real agent configuration…</div> : agents.length === 0 ? <Card><CardContent className="py-16 text-center"><Bot className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-3 font-medium">No agents are configured</div><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Aegis intentionally does not display seeded agents. Deploy an agent definition and bind it to a real integration to make it operational.</p><Button className="mt-4" asChild><Link to="/marketplace">Open Agent Catalog</Link></Button></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{agents.map((agent) => { const bs = bindings.filter((b) => b.agent_key === agent.agent_key); const real = bs.filter((b) => b.enabled && !b.is_mock); return <Card key={agent.agent_key}><CardHeader><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div><Badge variant="outline" className={real.length ? "border-success/40 text-success" : ""}>{real.length ? "Operational" : "Not bound"}</Badge></div><CardTitle className="mt-3 text-base">{agent.display_name}</CardTitle><CardDescription>{agent.description ?? "No description configured."}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="text-xs text-muted-foreground">Category: {agent.category ?? "Uncategorized"}</div><div className="rounded-lg border bg-muted/30 p-3 text-xs">{real.length ? <div className="flex items-center gap-1.5 text-success"><ShieldCheck className="h-3.5 w-3.5" /> {real.length} real integration binding{real.length > 1 ? "s" : ""}</div> : <div className="flex items-center gap-1.5 text-muted-foreground"><Plug className="h-3.5 w-3.5" /> No enabled real binding</div>}</div><div className="flex gap-2"><Button size="sm" className="flex-1" asChild><Link to="/agent/$agentKey" params={{ agentKey: agent.agent_key }}>View agent details</Link></Button><Button size="sm" variant="ghost" asChild><Link to="/integrations">Manage integrations</Link></Button></div></CardContent></Card>; })}</div>}
  </div>;
}
