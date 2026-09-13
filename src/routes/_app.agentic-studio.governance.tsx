import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/lib/tenant";
import { ShieldCheck, Workflow } from "lucide-react";

export const Route = createFileRoute("/_app/agentic-studio/governance")({ component: AgenticGovernancePage });
type Outcome = { id: string; agent_key: string; name: string; description: string | null; approval_required: boolean; enabled: boolean };
type Connection = { id: string; source_agent_key: string; target_agent_key: string; purpose: string | null; approval_required: boolean; enabled: boolean };

function AgenticGovernancePage() {
  const { tenantId } = useTenantContext();
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [agent, setAgent] = useState("agent-license");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => { if (!tenantId) return; setLoading(true); const [o, c] = await Promise.all([supabase.from("agent_outcomes").select("id,agent_key,name,description,approval_required,enabled").eq("tenant_id", tenantId).order("created_at"), supabase.from("agent_connections").select("id,source_agent_key,target_agent_key,purpose,approval_required,enabled").eq("tenant_id", tenantId).order("created_at")]); setOutcomes((o.data ?? []) as Outcome[]); setConnections((c.data ?? []) as Connection[]); setLoading(false); };
  useEffect(() => { void load(); }, [tenantId]);
  const addOutcome = async () => { if (!tenantId || !name.trim()) return; const { error } = await supabase.from("agent_outcomes").insert({ tenant_id: tenantId, agent_key: agent, name: name.trim(), approval_required: true, enabled: true }); if (error) return; setName(""); await load(); };
  return <div className="space-y-5"><PageHeader title="Agent Governance" description="The deployment page establishes the agent. This workspace governs what outcomes it may pursue and which agent-to-agent relationships are permitted." actions={<Button variant="outline" asChild><Link to="/agentic-studio">Back to Studio</Link></Button>} />
    <Card><CardHeader><CardTitle className="text-sm">Governance evidence</CardTitle><CardDescription>Outcomes and connections are tenant-scoped persisted policy objects. They do not imply that an execution runtime exists.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><div className="rounded-lg border p-4"><div className="text-2xl font-semibold">{outcomes.length}</div><div className="text-xs text-muted-foreground">configured outcomes</div></div><div className="rounded-lg border p-4"><div className="text-2xl font-semibold">{connections.length}</div><div className="text-xs text-muted-foreground">governed A2A links</div></div><div className="rounded-lg border p-4"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-primary" />Approval-gated by default</div><div className="mt-1 text-xs text-muted-foreground">Execution still passes existing approval and policy controls.</div></div></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">Multiple outcomes per agent</CardTitle><CardDescription>One deployed agent can have multiple independently governed outcomes.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Outcome name" /><Button onClick={() => void addOutcome()} disabled={!name.trim()}>Add</Button></div><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={agent} onChange={(e) => setAgent(e.target.value)}><option value="agent-license">License Agent</option><option value="agent-security">Security Agent</option><option value="agent-cost">Cost Agent</option><option value="agent-incident">Incident Agent</option><option value="agent-workflow">Workflow Agent</option></select>{loading ? <div className="text-xs text-muted-foreground">Loading…</div> : outcomes.length ? outcomes.map((o) => <div key={o.id} className="rounded-md border p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">{o.name}</span><Badge variant="outline">{o.agent_key}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{o.approval_required ? "Approval required" : "No approval required"} · {o.enabled ? "Enabled" : "Disabled"}</div></div>) : <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">No outcomes configured yet. No synthetic outcomes are created.</div>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">Agent-to-agent governance</CardTitle><CardDescription>Explicit source → target relationships provide an auditable A2A policy boundary.</CardDescription></CardHeader><CardContent className="space-y-3">{connections.length ? connections.map((c) => <div key={c.id} className="flex items-center gap-3 rounded-md border p-3"><Workflow className="h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{c.source_agent_key} → {c.target_agent_key}</div><div className="text-xs text-muted-foreground">{c.purpose ?? "No purpose configured"}</div></div><Badge variant="outline">{c.approval_required ? "Approval gated" : "Ungated"}</Badge></div>) : <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">No A2A connections configured. This is an honest empty state; the UI does not pretend agents can call one another.</div>}<div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">Runtime A2A execution is not claimed by this screen. When an execution runtime is introduced, it should consume these relationships as an authorization boundary and emit audit evidence.</div></CardContent></Card></div>
  </div>;
}
