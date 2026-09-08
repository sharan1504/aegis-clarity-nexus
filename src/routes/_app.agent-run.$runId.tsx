import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, Clock3, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgentRun, orchestrateAgentRun, advanceAgentRun } from "@/lib/agent-runtime.functions";
import type { AgentRunState, AgentRunStep } from "@/lib/agent-runtime";

export const Route = createFileRoute("/_app/agent-run/$runId")({ component: AgentRunPage });
const steps: Array<{ key: AgentRunStep; label: string; description: string }> = [
  { key: "plan", label: "Plan", description: "Inspectable workflow plan created." },
  { key: "investigate", label: "Investigate", description: "Collect provider-backed evidence." },
  { key: "policy", label: "Policy", description: "Evaluate deterministic governance rules." },
  { key: "approval", label: "Approval", description: "Human approval before mutation." },
  { key: "execute", label: "Execute", description: "Run only authorized provider mutations." },
  { key: "verify", label: "Verify", description: "Re-read provider state and record evidence." },
];
const stepIndex = (step: AgentRunStep) => steps.findIndex((item) => item.key === step);
function statusBadge(status: AgentRunState["status"]) {
  if (status === "completed") return <Badge className="gap-1 bg-success/15 text-success"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
  if (status === "waiting_approval") return <Badge variant="secondary" className="gap-1"><Clock3 className="h-3 w-3" />Waiting for approval</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
  return <Badge variant="outline">{status.replace("_", " ")}</Badge>;
}
function AgentRunPage() {
  const { runId } = Route.useParams();
  const load = useServerFn(getAgentRun); const orchestrate = useServerFn(orchestrateAgentRun); const advance = useServerFn(advanceAgentRun);
  const [run, setRun] = useState<AgentRunState | null>(null); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false);
  const refresh = async () => { try { const result = await load({ data: { runId } }); if (!result.ok) throw new Error(result.error); setRun(result.run); } catch (error) { toast.error("Could not load agent run", { description: error instanceof Error ? error.message : "Try again." }); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer); }, [runId]);
  const currentIndex = useMemo(() => run ? stepIndex(run.currentStep) : 0, [run]);
  const runInvestigation = async () => { setWorking(true); try { const result = await orchestrate({ data: { runId } }); if (!result.ok) throw new Error(result.error); setRun(result.run); toast.success("Runtime advanced", { description: `${result.recommendationCount} recommendation(s) reached the governance boundary.` }); } catch (error) { toast.error("Could not advance runtime", { description: error instanceof Error ? error.message : "Try again." }); } finally { setWorking(false); } };
  const approve = async () => { setWorking(true); try { const resumed = await advance({ data: { runId, transition: { type: "resume" } } }); if (!resumed.ok) throw new Error(resumed.error); const result = await advance({ data: { runId, transition: { type: "complete_step", step: "approval", value: { status: "approved", approvedAt: new Date().toISOString() } } } }); if (!result.ok) throw new Error(result.error); setRun(result.run); toast.success("Approval recorded", { description: "The runtime is now at the authorized execution boundary." }); } catch (error) { toast.error("Approval could not be recorded", { description: error instanceof Error ? error.message : "Try again." }); } finally { setWorking(false); } };
  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading agent run…</div>;
  if (!run) return <div className="py-16 text-center text-sm text-muted-foreground">Agent run not found.</div>;
  return <div className="space-y-6">
    <PageHeader title={`${run.agentKey} run`} description="A durable, tenant-scoped runtime trace. State changes are enforced by the runtime and provider capabilities remain authoritative." actions={<Button variant="outline" asChild><Link to="/agentic-studio"><ArrowLeft className="mr-1.5 h-4 w-4" />Agentic Studio</Link></Button>} />
    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="font-mono">{run.runId}</Badge>{statusBadge(run.status)}<Badge variant="outline">Current: {run.currentStep}</Badge></div>
    <Card><CardHeader><CardTitle className="text-base">Runtime lifecycle</CardTitle><CardDescription>Each stage is persisted. Approval is a hard pause; execution cannot be inferred from the plan.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-6">{steps.map((item, index) => { const done = run.status === "completed" || index < currentIndex; const current = index === currentIndex && run.status !== "completed"; return <div key={item.key} className={`rounded-xl border p-3 ${current ? "border-primary bg-primary/[0.04]" : done ? "border-success/30 bg-success/[0.03]" : "bg-muted/10"}`}><div className="flex items-center gap-2">{done ? <CheckCircle2 className="h-4 w-4 text-success" /> : current ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}<span className="text-xs font-semibold">{item.label}</span></div><div className="mt-2 text-[11px] text-muted-foreground">{item.description}</div></div>; })}</div></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]"><Card><CardHeader><CardTitle className="text-base">Run evidence</CardTitle><CardDescription>Evidence attached to the persisted investigation stage.</CardDescription></CardHeader><CardContent className="space-y-3">{run.evidence.length ? run.evidence.map((evidence, index) => <pre key={index} className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(evidence, null, 2)}</pre>) : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No investigation evidence has been persisted yet.</div>}</CardContent></Card>
      <div className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Governance</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Tenant authorization remains enforced.</div><div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Capabilities remain the execution boundary.</div><div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Policy evaluation is deterministic.</div><div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Approval is explicit and persisted.</div></CardContent></Card>
      {run.status === "planned" && <Button className="w-full" onClick={() => void runInvestigation()} disabled={working}>{working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Start governed investigation</Button>}{run.status === "waiting_approval" && <Button className="w-full" onClick={() => void approve()} disabled={working}>{working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Approve governed run</Button>}{run.status === "running" && run.currentStep === "execute" && <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">The run is approved, but this agent currently has no trusted GitHub write capability wired into execution. Aegis will not fabricate a mutation.</div>}{run.error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{run.error}</div>}</div></div>
  </div>;
}
