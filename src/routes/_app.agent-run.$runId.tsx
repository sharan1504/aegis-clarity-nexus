import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  GitBranch,
  Loader2,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgentRun, orchestrateAgentRun, advanceAgentRun } from "@/lib/agent-runtime.functions";
import type { AgentRunState, AgentRunStep } from "@/lib/agent-runtime";
import { buildAgentRunReplay, type EvidenceGraphNode } from "@/lib/agent-run-replay";

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

const graphIcon: Record<EvidenceGraphNode["kind"], typeof Search> = {
  finding: Search,
  evidence: GitBranch,
  agent: ShieldCheck,
  policy: ShieldCheck,
  recommendation: ArrowRight,
  approval: UserCheck,
  execution: LockKeyhole,
  verification: CheckCircle2,
};

function GraphNode({ node }: { node: EvidenceGraphNode }) {
  const Icon = graphIcon[node.kind];
  return (
    <div className="min-w-[180px] rounded-xl border bg-background p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">{node.label}</span>
      </div>
      {node.detail && <p className="mt-2 line-clamp-3 text-[11px] text-muted-foreground">{node.detail}</p>}
    </div>
  );
}

function AgentRunPage() {
  const { runId } = Route.useParams();
  const load = useServerFn(getAgentRun);
  const orchestrate = useServerFn(orchestrateAgentRun);
  const advance = useServerFn(advanceAgentRun);
  const [run, setRun] = useState<AgentRunState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const refresh = async () => {
    try {
      const result = await load({ data: { runId } });
      if (!result.ok) throw new Error(result.error);
      setRun(result.run);
    } catch (error) {
      toast.error("Could not load agent run", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [runId]);

  const currentIndex = useMemo(() => run ? stepIndex(run.currentStep) : 0, [run]);
  const replay = useMemo(() => run ? buildAgentRunReplay(run) : null, [run]);

  const runInvestigation = async () => {
    setWorking(true);
    try {
      const result = await orchestrate({ data: { runId } });
      if (!result.ok) throw new Error(result.error);
      setRun(result.run);
      toast.success("Runtime advanced", { description: `${result.recommendationCount} recommendation(s) reached the governance boundary.` });
    } catch (error) {
      toast.error("Could not advance runtime", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setWorking(false);
    }
  };

  const approve = async () => {
    setWorking(true);
    try {
      const resumed = await advance({ data: { runId, transition: { type: "resume" } } });
      if (!resumed.ok) throw new Error(resumed.error);
      const result = await advance({
        data: {
          runId,
          transition: { type: "complete_step", step: "approval", value: { status: "approved", approvedAt: new Date().toISOString() } },
        },
      });
      if (!result.ok) throw new Error(result.error);
      setRun(result.run);
      toast.success("Approval recorded", { description: "The runtime is now at the authorized execution boundary." });
    } catch (error) {
      toast.error("Approval could not be recorded", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading agent run…</div>;
  if (!run || !replay) return <div className="py-16 text-center text-sm text-muted-foreground">Agent run not found.</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${run.agentKey} run`}
        description="A durable, tenant-scoped runtime trace with replayable lifecycle state and evidence provenance."
        actions={<Button variant="outline" asChild><Link to="/agentic-studio"><ArrowLeft className="mr-1.5 h-4 w-4" />Agentic Studio</Link></Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">{run.runId}</Badge>
        {statusBadge(run.status)}
        <Badge variant="outline">Current: {run.currentStep}</Badge>
        <Badge variant="outline">Updated {new Date(run.updatedAt).toLocaleTimeString()}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run Replay</CardTitle>
          <CardDescription>Step-by-step reconstruction of what the runtime has completed, what is active, and what remains gated.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
            {replay.events.map((event, index) => {
              const current = event.state === "current";
              const done = event.state === "completed";
              const blocked = event.state === "blocked";
              return (
                <div key={event.step} className={`relative rounded-xl border p-3 ${current ? "border-primary bg-primary/[0.04]" : done ? "border-success/30 bg-success/[0.03]" : blocked ? "border-destructive/30 bg-destructive/[0.03]" : "bg-muted/10"}`}>
                  <div className="flex items-center gap-2">
                    {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : blocked ? <XCircle className="h-4 w-4 text-destructive" /> : current ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-xs font-semibold">{index + 1}. {event.label}</span>
                  </div>
                  <div className="mt-2 text-[11px] capitalize text-muted-foreground">{event.state}</div>
                  {event.value !== null && <pre className="mt-2 max-h-20 overflow-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(event.value, null, 2)}</pre>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidence Graph</CardTitle>
          <CardDescription>Trace the causal chain from user intent through evidence and policy to approval, execution, and verification. Missing nodes are intentionally not fabricated.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max items-center gap-2 py-3">
              {replay.nodes.map((node, index) => (
                <div key={node.id} className="flex items-center gap-2">
                  <GraphNode node={node} />
                  {index < replay.nodes.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {replay.edges.map((edge, index) => (
              <div key={`${edge.from}-${edge.to}-${index}`} className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                <span className="font-mono text-muted-foreground">{edge.from}</span> <span className="mx-1 text-primary">→</span> <span className="font-medium">{edge.label}</span> <span className="mx-1 text-primary">→</span> <span className="font-mono text-muted-foreground">{edge.to}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Provider evidence</CardTitle><CardDescription>Evidence persisted by the investigation stage, ordered by capture time.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {run.evidence.length ? run.evidence.map((evidence, index) => <pre key={index} className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(evidence, null, 2)}</pre>) : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No investigation evidence has been persisted yet.</div>}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Governance boundary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Tenant authorization remains enforced.</div>
              <div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Capabilities remain the execution boundary.</div>
              <div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Policy evaluation is deterministic.</div>
              <div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Approval is explicit and persisted.</div>
            </CardContent>
          </Card>
          {run.status === "planned" && <Button className="w-full" onClick={() => void runInvestigation()} disabled={working}>{working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Start governed investigation</Button>}
          {run.status === "waiting_approval" && <Button className="w-full" onClick={() => void approve()} disabled={working}>{working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Approve governed run</Button>}
          {run.status === "running" && run.currentStep === "execute" && <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">The run is approved, but this agent currently has no trusted GitHub write capability wired into execution. Aegis will not fabricate a mutation.</div>}
          {run.error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{run.error}</div>}
        </div>
      </div>
    </div>
  );
}
