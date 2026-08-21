import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bot, Plug, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/lib/tenant";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/marketplace")({ head: () => pageHead({ path: "/marketplace", title: "Agent Catalog — Aegis AI", description: "Discover verified enterprise agents available in your workspace. No demo agents or fake installs are shown." }), component: MarketplacePage });

type AgentRow = { agent_key: string; display_name: string; description: string | null; category: string | null };
type BindingRow = { agent_key: string; enabled: boolean; is_mock: boolean; integration_id: string };

function MarketplacePage() {
  const { tenantId } = useTenantContext();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [bindings, setBindings] = useState<BindingRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => { if (!tenantId) return; setLoading(true); const [a, b] = await Promise.all([supabase.from("agent_definitions").select("agent_key,display_name,description,category").order("display_name"), supabase.from("agent_integration_bindings").select("agent_key,enabled,is_mock,integration_id").eq("tenant_id", tenantId)]); setAgents((a.data ?? []) as AgentRow[]); setBindings((b.data ?? []) as BindingRow[]); setLoading(false); };
  useEffect(() => { void load(); }, [tenantId]);
  const filtered = useMemo(() => agents.filter((a) => `${a.display_name} ${a.description ?? ""} ${a.category ?? ""}`.toLowerCase().includes(query.toLowerCase())), [agents, query]);
  const bindingFor = (key: string) => bindings.filter((b) => b.agent_key === key);
  return <div><PageHeader title="Agent Catalog" description="This is a verified catalog, not a demo marketplace. Agents appear only when they exist in the workspace data model." actions={<Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>} />
    <Card className="mb-4"><CardContent className="flex items-center gap-3 py-3"><Search className="h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search verified agents…" className="h-9" /><span className="text-xs text-muted-foreground">{filtered.length} agents</span></CardContent></Card>
    {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading verified agent catalog…</div> : filtered.length === 0 ? <Card><CardContent className="py-16 text-center"><Bot className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-3 font-medium">No verified marketplace agents</div><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">That is expected until an agent definition is deployed. We intentionally removed seeded marketplace entries so this page cannot imply capabilities that are not actually available.</p><Button className="mt-4" size="sm" asChild><Link to="/agents">Open AI Agents</Link></Button></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((agent) => { const bs = bindingFor(agent.agent_key); const real = bs.filter((b) => b.enabled && !b.is_mock); return <Card key={agent.agent_key}><CardHeader><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div><Badge variant="outline" className={real.length ? "border-success/40 text-success" : ""}>{real.length ? "Verified" : "Needs configuration"}</Badge></div><CardTitle className="mt-3 text-base">{agent.display_name}</CardTitle><CardDescription>{agent.description ?? "No description configured."}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="text-xs text-muted-foreground">Category: {agent.category ?? "Uncategorized"}</div><div className="rounded-md border bg-muted/30 p-3 text-xs">{real.length ? <span className="flex items-center gap-1.5 text-success"><ShieldCheck className="h-3.5 w-3.5" /> Bound to real integration data.</span> : <span className="flex items-center gap-1.5 text-muted-foreground"><Plug className="h-3.5 w-3.5" /> No real integration binding is enabled.</span>}</div><div className="flex gap-2"><Button size="sm" className="flex-1" asChild><Link to="/agents">Configure in AI Agents</Link></Button><Button size="sm" variant="ghost" asChild><Link to="/integrations">Integrations</Link></Button></div></CardContent></Card>; })}</div>}
  </div>;
}
