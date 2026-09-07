import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, FlaskConical, GitBranch, History, Loader2, Play, RotateCcw, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateAgentWorkflowFromPrompt, type GeneratedAgentWorkflow } from "@/lib/agent-prompt-workflow.functions";
import { PageHeader } from "@/components/layout/AppLayout";

export const Route = createFileRoute("/_app/agentic-studio")({ component: AgenticStudioPage });

type StudioMode = "architect" | "investigate" | "simulate" | "execute";

const agents = [
  { key: "agent-license", name: "License Agent", description: "Optimize unused licenses and reclaimable capacity." },
  { key: "agent-security", name: "Security Agent", description: "Investigate security findings and remediation opportunities." },
  { key: "agent-cost", name: "Cost Agent", description: "Analyze cloud and platform spend for optimization." },
  { key: "agent-incident", name: "Incident Agent", description: "Investigate operational incidents and coordinate response." },
  { key: "agent-workflow", name: "Workflow Agent", description: "Turn operational objectives into governed workflows." },
];

const examples = [
  "Find licenses unused for 90 days, recommend reclaiming eligible licenses, require approval, and verify the result.",
  "Investigate high-severity security findings, group them by repository, recommend the safest remediation path, and verify the outcome.",
  "Analyze recent platform usage and identify the top opportunities to reduce operational cost without affecting active users.",
];

function AgenticStudioPage() {
  const generate = useServerFn(generateAgentWorkflowFromPrompt);
  const [agentKey, setAgentKey] = useState(agents[0].key);
  const [mode, setMode] = useState<StudioMode>("architect");
  const [prompt, setPrompt] = useState(examples[0]);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedAgentWorkflow | null>(null);
  const selectedAgent = agents.find((agent) => agent.key === agentKey) ?? agents[0];

  const buildPlan = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const result = await generate({ data: { agentKey, prompt: prompt.trim() } });
      if (!result.ok) throw new Error("Workflow generation failed.");
      setGenerated(result);
      toast.success("Aegis built an agentic plan", { description: "Review the evidence, policy and execution path before applying it." });
    } catch (error) {
      toast.error("Could not build the plan", { description: error instanceof Error ? error.message : "Try a different request." });
    } finally {
      setGenerating(false);
    }
  };

  const reset = () => {
    setGenerated(null);
    setPrompt("");
    setMode("architect");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agentic Studio"
        description="Turn an operational outcome into an inspectable, governed AI plan — then simulate it before execution."
        actions={<Badge variant="outline" className="gap-1.5 border-warning/40 text-warning-foreground"><Sparkles className="h-3.5 w-3.5" />Demo experience</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-sm">Agent</CardTitle><CardDescription>Choose the agent whose capabilities shape the plan.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Select value={agentKey} onValueChange={(value) => { setAgentKey(value); setGenerated(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{agents.map((agent) => <SelectItem key={agent.key} value={agent.key}>{agent.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">{selectedAgent.description}</div>
            <div className="space-y-2 pt-2 text-xs">
              <div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" />Capability constrained</div>
              <div className="flex items-center gap-2"><GitBranch className="h-3.5 w-3.5 text-primary" />Policy governed</div>
              <div className="flex items-center gap-2"><History className="h-3.5 w-3.5 text-primary" />Evidence traceable</div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-primary/20">
          <CardHeader className="border-b bg-primary/[0.03] pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><CardTitle className="flex items-center gap-2 text-base"><Workflow className="h-5 w-5 text-primary" />Aegis Agentic Studio</CardTitle><CardDescription className="mt-1">Describe the outcome. Aegis turns it into a plan you can inspect and simulate.</CardDescription></div>
              {generated && <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />New plan</Button>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4">
              {([ ["architect", "Architect", Sparkles], ["investigate", "Investigate", History], ["simulate", "Simulate", FlaskConical], ["execute", "Execute", Play] ] as const).map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setMode(key)} className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition ${mode === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
            </div>
          </CardHeader>

          <CardContent className="p-5">
            {mode === "architect" && <ArchitectView prompt={prompt} setPrompt={setPrompt} generating={generating} buildPlan={buildPlan} generated={generated} />}
            {mode === "investigate" && <InvestigationView generated={generated} />}
            {mode === "simulate" && <SimulationView generated={generated} />}
            {mode === "execute" && <ExecutionView generated={generated} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ArchitectView({ prompt, setPrompt, generating, buildPlan, generated }: { prompt: string; setPrompt: (value: string) => void; generating: boolean; buildPlan: () => Promise<void>; generated: GeneratedAgentWorkflow | null }) {
  return <div className="space-y-5">
    <div className="rounded-xl border bg-background p-4 shadow-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Describe the outcome</div>
      <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Example: Reduce unused licenses without impacting active users." className="min-h-28 resize-none border-0 p-0 text-base shadow-none focus-visible:ring-0" maxLength={6000} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">Natural language → governed workflow → simulation</span>
        <Button onClick={() => void buildPlan()} disabled={generating || !prompt.trim()}>{generating ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Building plan…</> : <><Sparkles className="mr-1.5 h-4 w-4" />Build agentic plan</>}</Button>
      </div>
    </div>
    {!generated ? <div className="grid gap-3 md:grid-cols-3"><Feature title="Investigate" text="Gather the evidence needed to understand the request." icon={History} /><Feature title="Decide" text="Apply enabled capabilities and tenant policy." icon={ShieldCheck} /><Feature title="Prove" text="Verify the outcome and preserve an evidence trail." icon={CheckCircle2} /></div> : <GeneratedPlan workflow={generated} />}
  </div>;
}

function GeneratedPlan({ workflow }: { workflow: GeneratedAgentWorkflow }) {
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-muted/20 p-4"><div><div className="text-sm font-semibold">{workflow.summary}</div><div className="mt-1 text-xs text-muted-foreground">Trigger: {workflow.trigger}</div></div><Badge variant="outline">{workflow.steps.length} steps</Badge></div>
    <div className="relative space-y-2 pl-2">
      {workflow.steps.map((step, index) => <div key={step.id} className="relative flex gap-3 rounded-xl border bg-background p-4 shadow-sm">
        {index < workflow.steps.length - 1 && <div className="absolute left-[19px] top-11 h-[calc(100%+8px)] w-px bg-border" />}
        <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold">{index + 1}</div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-sm font-semibold">{step.name}</div>{step.requiresApproval && <Badge variant="secondary" className="text-[10px]">Approval required</Badge>}</div><div className="mt-1 text-[11px] text-muted-foreground">{step.provider ?? "Aegis"} · {step.capability ?? step.type}</div><div className="mt-2 text-sm">{step.action}</div>{step.verification && <div className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">Verification: {step.verification}</div>}</div>
      </div>)}
    </div>
    {workflow.assumptions.length > 0 && <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs"><strong>AI assumptions:</strong> {workflow.assumptions.join(" · ")}</div>}
    <div className="flex flex-wrap gap-2"><Button asChild><Link to="/agent/$agentKey" params={{ agentKey: "agent-license" }}>Open agent builder<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button><Button variant="outline">Run simulation <FlaskConical className="ml-1.5 h-4 w-4" /></Button></div>
  </div>;
}

function InvestigationView({ generated }: { generated: GeneratedAgentWorkflow | null }) {
  if (!generated) return <EmptyMode icon={History} title="Investigation starts from a plan" text="Build an agentic plan first. Aegis will use the plan to organize the evidence it needs before making a recommendation." />;
  const evidence = ["Agent capability context", "Tenant policy and governance constraints", "Provider evidence required by each workflow step", "Verification criteria defined by the generated plan"];
  return <div className="space-y-4"><SectionIntro icon={History} title="Investigation plan" text="Aegis separates evidence gathering from action. The AI proposes what to inspect; the capability layer supplies the facts." /><div className="grid gap-3 md:grid-cols-2">{evidence.map((item, index) => <div key={item} className="rounded-lg border p-4"><div className="text-xs font-semibold text-muted-foreground">EVIDENCE {index + 1}</div><div className="mt-1 text-sm">{item}</div><Badge className="mt-3" variant="outline">Planned</Badge></div>)}</div></div>;
}

function SimulationView({ generated }: { generated: GeneratedAgentWorkflow | null }) {
  if (!generated) return <EmptyMode icon={FlaskConical} title="Simulation is ready after planning" text="Generate a workflow to see the production-safe simulation view." />;
  const mutations = generated.steps.filter((step) => step.requiresApproval).length;
  return <div className="space-y-4"><SectionIntro icon={FlaskConical} title="Production-safe simulation" text="This view demonstrates impact without executing external mutations." /><div className="grid gap-3 sm:grid-cols-3"><Stat label="Workflow steps" value={String(generated.steps.length)} /><Stat label="Governed actions" value={String(mutations)} /><Stat label="Production mutations" value="0" /></div><div className="rounded-xl border border-warning/30 bg-warning/5 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 text-warning-foreground" /><div><div className="text-sm font-semibold">No production changes will be made</div><div className="mt-1 text-xs text-muted-foreground">Aegis can show expected candidates, policy decisions, approvals and verification paths before an execution request is released.</div></div></div></div><div className="space-y-2">{generated.steps.map((step, index) => <div key={step.id} className="flex items-center gap-3 rounded-lg border p-3"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</div><div className="flex-1 text-sm">{step.name}</div><Badge variant={step.requiresApproval ? "secondary" : "outline"}>{step.requiresApproval ? "Approval gate" : "Read / analyze"}</Badge></div>)}</div></div>;
}

function ExecutionView({ generated }: { generated: GeneratedAgentWorkflow | null }) {
  if (!generated) return <EmptyMode icon={Play} title="Execution is governed" text="Generate and review a plan before requesting execution." />;
  return <div className="space-y-4"><SectionIntro icon={Play} title="Governed execution" text="Execution is intentionally separated from AI planning. Mutations remain approval-gated and must go through Aegis governance." /><div className="rounded-xl border p-4"><div className="space-y-3">{["Plan generated", "Evidence collected", "Policy evaluated", "Human approval", "Execute approved actions", "Verify outcome", "Write audit evidence"].map((item, index) => <div key={item} className="flex items-center gap-3"><div className={`flex h-7 w-7 items-center justify-center rounded-full ${index < 3 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{index < 3 ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</div><div className="text-sm">{item}</div>{index === 3 && <Badge className="ml-auto" variant="secondary">Required</Badge>}</div>)}</div></div><Button disabled className="w-full sm:w-auto">Request governed execution <ArrowRight className="ml-1.5 h-4 w-4" /></Button><p className="text-xs text-muted-foreground">Demo mode keeps execution disabled. Live execution will use the capability router, policy engine, approvals and verification pipeline.</p></div>;
}

function Feature({ title, text, icon: Icon }: { title: string; text: string; icon: React.ComponentType<{ className?: string }> }) { return <div className="rounded-xl border p-4"><Icon className="h-4 w-4 text-primary" /><div className="mt-2 text-sm font-semibold">{title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{text}</div></div>; }
function SectionIntro({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) { return <div className="flex gap-3 rounded-xl border bg-primary/[0.03] p-4"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><div className="text-sm font-semibold">{title}</div><div className="mt-1 text-xs text-muted-foreground">{text}</div></div></div>; }
function EmptyMode({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) { return <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed text-center"><Icon className="h-8 w-8 text-muted-foreground" /><div className="mt-3 text-sm font-semibold">{title}</div><div className="mt-1 max-w-md text-xs text-muted-foreground">{text}</div></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border p-4"><div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div>; }
