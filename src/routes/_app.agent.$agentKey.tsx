import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, ArrowLeft, CheckCircle2, Coins, Gauge, GripVertical, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyIntegrationsState } from "@/components/EmptyIntegrationsState";
import { getAgentDetail, type AgentDetail, type AgentWorkflowStep } from "@/lib/agent-detail.functions";
import { saveAgentWorkflow } from "@/lib/agent-workflow.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/agent/$agentKey")({ head: ({ params }) => pageHead({ path: `/agent/${params.agentKey}`, title: "Agent Workflow — Aegis AI", description: "Configure an agent's capabilities, integrations, workflow and governance." }), component: AgentDetailPage });

type EditableStep = AgentWorkflowStep;

function AgentDetailPage() {
  const { agentKey } = Route.useParams();
  const load = useServerFn(getAgentDetail); const save = useServerFn(saveAgentWorkflow);
  const [data, setData] = useState<AgentDetail | null>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [trigger, setTrigger] = useState(""); const [configText, setConfigText] = useState("{}"); const [steps, setSteps] = useState<EditableStep[]>([]);

  useEffect(() => { let active = true; void load({ data: { agentKey } }).then((result) => { if (!active) return; setData(result); if (result?.workflow) { setTrigger(result.workflow.trigger); setConfigText(JSON.stringify(result.workflow.config, null, 2)); setSteps(result.workflow.steps); } }).catch((error) => toast.error("Could not load agent", { description: error instanceof Error ? error.message : "Try again." })).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [agentKey, load]);

  const updateStep = (id: string, patch: Partial<EditableStep>) => setSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step));
  const addStep = () => setSteps((current) => [...current, { id: `custom-${Date.now()}`, name: "New workflow step", type: "decision", action: "Describe what this step should do.", requiresApproval: false }]);
  const removeStep = (id: string) => setSteps((current) => current.filter((step) => step.id !== id));
  const saveWorkflow = async () => {
    let config: Record<string, unknown>;
    try { const parsed = JSON.parse(configText); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Configuration must be a JSON object."); config = parsed as Record<string, unknown>; } catch (error) { toast.error("Invalid agent configuration", { description: error instanceof Error ? error.message : "Use valid JSON." }); return; }
    setSaving(true); try { const result = await save({ data: { agentKey, trigger, config, steps } }); if (!result.ok) throw new Error(result.error); toast.success(result.demo ? "Demo workflow configuration saved for this session" : "Agent workflow saved"); } catch (error) { toast.error("Could not save workflow", { description: error instanceof Error ? error.message : "Try again." }); } finally { setSaving(false); }
  };

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading agent workflow…</div>;
  if (!data) return <EmptyIntegrationsState title="Agent not found" description="This agent definition is not available in the current workspace." />;

  return <div>
    <PageHeader title={data.displayName} description={data.description ?? "Configure this agent for your organization's workflow."} actions={<Button variant="outline" asChild><Link to="/agents"><ArrowLeft className="mr-1.5 h-4 w-4" />Back to agents</Link></Button>} />
    <div className="mb-4 flex flex-wrap gap-2"><Badge variant="outline">{data.category ?? "Uncategorized"}</Badge><Badge variant="outline" className="border-success/40 text-success"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Demo ready</Badge><Badge variant="outline">Tenant configurable</Badge></div>
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><Metric icon={Activity} label="AI requests" value={data.telemetry.aiRequests.toLocaleString()} /><Metric icon={Coins} label="Tokens" value={data.telemetry.totalTokens.toLocaleString()} /><Metric icon={Gauge} label="Avg latency" value={data.telemetry.averageLatencyMs == null ? "—" : `${data.telemetry.averageLatencyMs} ms`} /><Metric icon={Coins} label="Estimated outcome" value={data.savings.summary} /></div>
    <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle className="text-base">Workflow builder</CardTitle><CardDescription>Configure the same end-to-end pattern used in production: trigger → evidence → decision → action/approval → verification → customer response.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div><label className="mb-1 block text-xs font-medium">Trigger</label><Input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="When should this agent run?" /></div>
        <div className="space-y-3">{steps.map((step, index) => <div key={step.id} className="rounded-xl border bg-muted/10 p-4"><div className="flex items-start gap-3"><GripVertical className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" /><div className="flex-1 space-y-2"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant="outline">{index + 1}</Badge><Input value={step.name} onChange={(e) => updateStep(step.id, { name: e.target.value })} className="h-8 font-medium" /></div><Button size="icon" variant="ghost" onClick={() => removeStep(step.id)} aria-label="Remove step"><Trash2 className="h-4 w-4" /></Button></div><div className="grid gap-2 md:grid-cols-3"><Input value={step.type} onChange={(e) => updateStep(step.id, { type: e.target.value })} placeholder="step type" /><Input value={step.provider ?? ""} onChange={(e) => updateStep(step.id, { provider: e.target.value || undefined })} placeholder="integration/provider" /><Input value={step.capability ?? ""} onChange={(e) => updateStep(step.id, { capability: e.target.value || undefined })} placeholder="capability" /></div><Textarea value={step.action} onChange={(e) => updateStep(step.id, { action: e.target.value })} placeholder="What should this step do?" className="min-h-16" />{(step.type === "verification" || step.verification) && <Input value={step.verification ?? ""} onChange={(e) => updateStep(step.id, { verification: e.target.value })} placeholder="Verification condition" />}<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(step.requiresApproval)} onChange={(e) => updateStep(step.id, { requiresApproval: e.target.checked })} />Require governance approval before this action</label></div></div></div>)} </div>
        <Button variant="outline" onClick={addStep}><Plus className="mr-1.5 h-4 w-4" />Add workflow step</Button>
      </CardContent></Card>
      <div className="space-y-4">
        <Card><CardHeader><CardTitle className="text-base">Connected capabilities</CardTitle><CardDescription>These are the integration/capability slots the workflow can use.</CardDescription></CardHeader><CardContent className="space-y-2">{data.bindings.map((binding) => <div key={`${binding.integrationId}-${binding.capabilityKey}`} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><div className="text-sm font-medium">{binding.provider ?? "Provider"}</div><Badge variant="outline" className={binding.isMock ? "" : "border-success/40 text-success"}>{binding.isMock ? "Demo" : "Live"}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{binding.capabilityName ?? binding.capabilityKey ?? "Workflow capability"}</div></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Agent policy</CardTitle><CardDescription>Tenant-specific parameters. These become workflow inputs in production.</CardDescription></CardHeader><CardContent><Textarea value={configText} onChange={(e) => setConfigText(e.target.value)} className="min-h-48 font-mono text-xs" /><Button className="mt-3 w-full" onClick={() => void saveWorkflow()} disabled={saving}><Save className="mr-1.5 h-4 w-4" />{saving ? "Saving…" : "Save workflow configuration"}</Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Governance & evidence</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><div className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />Every tool call can be correlated to the agent run and investigation.</div><div className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />Actions marked approval-required stay behind governance.</div><div className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />Verification is a first-class workflow step.</div></CardContent></Card>
      </div>
    </div>
    <div className="mt-6 grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Related changes</CardTitle></CardHeader><CardContent className="space-y-2">{data.changes.length ? data.changes.map((change) => <Link key={change.rowId} to="/approvals/$id" params={{ id: change.rowId }} className="block rounded-lg border p-3 hover:bg-muted/30"><div className="flex justify-between gap-3"><div><div className="text-sm font-medium">{change.title}</div><div className="text-xs text-muted-foreground">{change.changeId} · {change.stage} · {change.severity}</div></div><span className="text-xs text-primary">{change.savings}</span></div></Link>) : <div className="py-6 text-center text-sm text-muted-foreground">No related changes.</div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader><CardContent className="space-y-2">{data.activity.length ? data.activity.map((item, index) => <div key={`${item.createdAt}-${index}`} className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-primary" />{item.action}</div><div className="mt-1 text-xs text-muted-foreground">{item.detail ?? "No detail recorded"} · {new Date(item.createdAt).toLocaleString()}</div></div>) : <div className="py-6 text-center text-sm text-muted-foreground">No activity.</div>}</CardContent></Card></div>
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) { return <Card><CardContent className="p-4"><Icon className="h-4 w-4 text-muted-foreground" /><div className="mt-2 break-words text-xl font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></CardContent></Card>; }
