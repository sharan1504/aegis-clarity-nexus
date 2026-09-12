import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyIntegrationsState } from "@/components/EmptyIntegrationsState";
import { AgentDataSourceManager } from "@/components/agents/AgentDataSourceManager";
import { AgentPurposeEditor } from "@/components/agents/AgentPurposeEditor";
import { getAgentDetail, type AgentDetail } from "@/lib/agent-detail.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_platform/agent/$agentKey")({
  head: ({ params }) => pageHead({ path: `/platform/agent/${params.agentKey}`, title: "Agent Configuration — Aegis AI", description: "Configure an agent's purpose, capabilities, policies and instructions." }),
  component: AgentDetailPage,
});

function AgentDetailPage() {
  const { agentKey } = Route.useParams();
  const load = useServerFn(getAgentDetail);
  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void load({ data: { agentKey } }).then((result) => { if (active) setData(result); }).catch((error) => toast.error("Could not load agent", { description: error instanceof Error ? error.message : "Try again." })).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [agentKey, load]);

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading agent configuration…</div>;
  if (!data) return <EmptyIntegrationsState title="Agent not found" description="This agent definition is not available in the current workspace." />;

  return <div>
    <PageHeader title={data.displayName} description={data.description ?? "Configure this agent for your organization's governed operations."} actions={<div className="flex gap-2"><Button variant="outline" asChild><Link to="/platform/agents"><ArrowLeft className="mr-1.5 h-4 w-4" />Back to agents</Link></Button><Button asChild><Link to="/platform/agentic-studio"><Sparkles className="mr-1.5 h-4 w-4" />Open Agentic Studio</Link></Button></div>} />
    <div className="mb-4 flex flex-wrap gap-2"><Badge variant="outline">{data.category ?? "Uncategorized"}</Badge><Badge variant="outline" className="border-success/40 text-success"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />AI workflow ready</Badge><Badge variant="outline">Governance enabled</Badge></div>

    <AgentPurposeEditor agentKey={agentKey} agentName={data.displayName} />
    <div className="mt-6"><AgentDataSourceManager agentKey={agentKey} agentName={data.displayName} /></div>

    <Card className="mt-6 border-primary/20 bg-primary/[0.03]"><CardHeader><CardTitle className="text-base">Workflows</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Agent Configuration defines the agent. Agentic Studio is the single workspace for turning an operational request into an inspectable workflow, investigating evidence, simulating impact and handing an approved plan to governed execution.</p><div className="grid gap-2 sm:grid-cols-4"><Flow label="Intent" /><Flow label="Evidence" /><Flow label="Policy" /><Flow label="Workflow" /></div><Button asChild><Link to="/platform/agentic-studio"><Sparkles className="mr-1.5 h-4 w-4" />Open workflows in Agentic Studio</Link></Button></CardContent></Card>

    <div className="mt-6 grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Related changes</CardTitle></CardHeader><CardContent className="space-y-2">{data.changes.length ? data.changes.map((change) => <Link key={change.rowId} to="/platform/approvals/$id" params={{ id: change.rowId }} className="block rounded-lg border p-3 hover:bg-muted/30"><div className="flex justify-between gap-3"><div><div className="text-sm font-medium">{change.title}</div><div className="text-xs text-muted-foreground">{change.changeId} · {change.stage} · {change.severity}</div></div><span className="text-xs text-primary">{change.savings}</span></div></Link>) : <div className="py-6 text-center text-sm text-muted-foreground">No related changes.</div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader><CardContent className="space-y-2">{data.activity.length ? data.activity.map((item, index) => <div key={`${item.createdAt}-${index}`} className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-primary" />{item.action}</div><div className="mt-1 text-xs text-muted-foreground">{item.detail ?? "No detail recorded"} · {new Date(item.createdAt).toLocaleString()}</div></div>) : <div className="py-6 text-center text-sm text-muted-foreground">No activity.</div>}</CardContent></Card></div>
  </div>;
}

function Flow({ label }: { label: string }) { return <div className="rounded-md border bg-background px-3 py-2 text-center text-xs font-medium">{label}</div>; }
