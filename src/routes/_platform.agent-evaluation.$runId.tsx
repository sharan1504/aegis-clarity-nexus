import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { evaluateAgentRunFn, getAgentEvaluations } from "@/lib/agent-evaluation.functions";

export const Route = createFileRoute("/_platform/agent-evaluation/$runId")({ component: AgentEvaluationPage });

function AgentEvaluationPage() {
  const { runId } = Route.useParams();
  const evaluate = useServerFn(evaluateAgentRunFn);
  const load = useServerFn(getAgentEvaluations);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [working, setWorking] = useState(false);

  const runEvaluation = async () => {
    setWorking(true);
    try {
      const result = await evaluate({ data: { runId } });
      if (!result.ok) throw new Error(result.error);
      setEvaluation(result.result);
      const saved = await load({ data: { runId } });
      if (saved.ok) setHistory(saved.evaluations);
      toast.success("Evaluation completed", { description: `${result.result.passed} passed · ${result.result.failed} failed` });
    } catch (error) {
      toast.error("Evaluation failed", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setWorking(false);
    }
  };

  return <div className="space-y-6">
    <PageHeader title="Agent Evaluation" description="Deterministic trust checks over the persisted Agent Run Event Log. Evaluation observes runtime facts; it never grants execution permission." actions={<Button variant="outline" asChild><Link to="/platform/agent-run/$runId" params={{ runId }}><ArrowLeft className="mr-1.5 h-4 w-4" />Run Debugger</Link></Button>} />
    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="font-mono">{runId}</Badge><Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3" />Governance evaluation</Badge></div>
    <Card><CardHeader><CardTitle className="text-base">Trust Suite</CardTitle><CardDescription>Normal, edge, failure, governance and prompt-injection boundaries are evaluated deterministically from persisted state and events.</CardDescription></CardHeader><CardContent><Button onClick={() => void runEvaluation()} disabled={working}>{working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Run evaluation suite</Button></CardContent></Card>
    {evaluation && <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">Latest result</CardTitle><CardDescription>{evaluation.passed} passed · {evaluation.failed} failed</CardDescription></div><Badge variant={evaluation.status === "passed" ? "default" : "destructive"}>{evaluation.status}</Badge></div></CardHeader><CardContent className="space-y-3">{evaluation.results.map((result: any) => <div key={result.caseId} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">{result.caseId}</div><div className="text-xs capitalize text-muted-foreground">{result.category}</div></div>{result.status === "passed" ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}</div><div className="mt-3 space-y-2">{result.assertions.map((item: any) => <div key={item.id} className="rounded-lg bg-muted/30 px-3 py-2 text-xs"><div className="flex items-center gap-2">{item.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}<span className="font-medium">{item.description}</span></div><div className="mt-1 pl-5 text-muted-foreground">{item.evidence}</div></div>)}</div></div>)}</CardContent></Card>}
    <Card><CardHeader><CardTitle className="text-base">Evaluation history</CardTitle><CardDescription>Tenant-scoped persisted evaluation runs.</CardDescription></CardHeader><CardContent>{history.length ? <div className="space-y-2">{history.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"><span>{new Date(item.created_at).toLocaleString()}</span><span>{item.passed} passed · {item.failed} failed</span><Badge variant={item.status === "passed" ? "default" : "destructive"}>{item.status}</Badge></div>)}</div> : <p className="text-sm text-muted-foreground">Run the suite to create the first evaluation record.</p>}</CardContent></Card>
  </div>;
}
