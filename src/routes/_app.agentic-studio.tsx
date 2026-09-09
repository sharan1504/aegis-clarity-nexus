import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Eye, FlaskConical, History, Loader2, Play, RotateCcw, ShieldCheck, Sparkles, Workflow, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateAgentWorkflowFromPrompt, type GeneratedAgentWorkflow } from "@/lib/agent-prompt-workflow.functions";
import { createAgentRun } from "@/lib/agent-runtime.functions";
import { listAgentRuntimeTools } from "@/lib/mcp/agent-runtime-tools.functions";
import type { AgentToolAvailability } from "@/lib/mcp/agent-tool-availability.server";
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
  "Investigate high and critical security findings from connected GitHub repositories, evaluate them against the configured security policy, recommend remediation for eligible findings, require approval before any change, and verify the result.",
  "Analyze recent platform usage and identify the top opportunities to reduce operational cost without affecting active users.",
];

function AgenticStudioPage() {
  const generate = useServerFn(generateAgentWorkflowFromPrompt);
  const persistRun = useServerFn(createAgentRun);
  const discoverTools = useServerFn(listAgentRuntimeTools);
  const [agentKey, setAgentKey] = useState("agent-license");
  const [mode, setMode] = useState<StudioMode>("architect");
  const [prompt, setPrompt] = useState(examples[0]);
  const [generating, setGenerating] = useState(false);
  const [creatingRun, setCreatingRun] = useState(false);
  const [generated, setGenerated] = useState<GeneratedAgentWorkflow | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [tools, setTools] = useState<AgentToolAvailability[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const selectedAgent = agents.find((agent) => agent.key === agentKey) ?? agents[0];

  const refreshTools = async (nextAgentKey: string) => {
    setLoadingTools(true);
    try {
      const result = await discoverTools({ data: { agentKey: nextAgentKey } });
      if (!result.ok) throw new Error(result.error);
      setTools(result.tools);
    } catch (error) {
      setTools([]);
      toast.error("Could not load governed MCP tools", { description: error instanceof Error ? error.message : "Tool availability could not be resolved." });
    } finally {
      setLoadingTools(false);
    }
  };

  useEffect(() => {
    void refreshTools(agentKey);
  }, [agentKey]);

  const buildPlan = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setRunId(null);
    try {
      const result = await generate({ data: { agentKey, prompt: prompt.trim() } });
      if (!result.ok) throw new Error("Workflow generation failed.");
      setGenerated(result);
      toast.success("Aegis built an agentic plan", { description: "Review the plan, then create a durable governed run." });
    } catch (error) {
      toast.error("Could not build the plan", { description: error instanceof Error ? error.message : "Try a different request." });
    } finally {
      setGenerating(false);
    }
  };

  const createRun = async () => {
    if (!generated) return;
    setCreatingRun(true);
    try {
      const result = await persistRun({ data: { agentKey, input: prompt.trim() } });
      if (!result.ok) throw new Error(result.error);
      setRunId(result.runId);
      toast.success("Governed run created", { description: `Run ${result.runId} is persisted at the Plan stage.` });
      setMode("investigate");
    } catch (error) {
      toast.error("Could not create governed run", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setCreatingRun(false);
    }
  };

  const reset = () => {
    setGenerated(null);
    setRunId(null);
    setPrompt("");
    setMode("architect");
  };

  const availableTools = tools.filter((tool) => tool.available);
  const blockedTools = tools.filter((tool) => !tool.available);

  return <div className="space-y-6">
    <PageHeader title="Agentic Studio" description="Describe an operational outcome once. Aegis plans it using the selected agent's capabilities and policies, then persists a governed run for investigation and approval." actions={<Badge variant="outline" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />Governed planning</Badge>} />
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <CardHeader><CardTitle className="text-sm">Planning context</CardTitle><CardDescription>The agent defines responsibility. Capabilities, MCP tools and policies define what the plan may use.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Select value={agentKey} onValueChange={(value) => { setAgentKey(value); setGenerated(null); setRunId(null); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{agents.map((agent) => <SelectItem key={agent.key} value={agent.key}>{agent.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">{selectedAgent.description}</div>
          <div className="space-y-2 border-t pt-3 text-xs">
            <div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" />Capability constrained</div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" />Policy enforced outside AI</div>
            <div className="flex items-center gap-2"><History className="h-3.5 w-3.5 text-primary" />Durable evidence and provenance</div>
          </div>
          <div className="border-t pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold"><Wrench className="h-3.5 w-3.5" />Available MCP tools</div>
              {loadingTools ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <Badge variant="secondary" className="text-[10px]">{availableTools.length} available</Badge>}
            </div>
            <div className="mt-3 space-y-2">
              {availableTools.slice(0, 8).map((tool) => <div key={tool.name} className="rounded-md border p-2"><div className="text-[11px] font-medium">{tool.title}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{tool.capability ?? "Aegis"} · {tool.readOnly ? "read-only" : "approval-gated"}</div></div>)}
              {blockedTools.slice(0, 3).map((tool) => <div key={tool.name} className="rounded-md border border-dashed p-2 opacity-75"><div className="flex items-center gap-1 text-[11px] font-medium"><CircleAlert className="h-3 w-3" />{tool.title}</div><div className="mt-0.5 text-[10px] text-muted-foreground">Blocked: {tool.reasons[0]}</div></div>)}
              {!loadingTools && tools.length === 0 && <div className="rounded-md border border-dashed p-3 text-[10px] text-muted-foreground">No governed MCP tool metadata is currently available for this agent.</div>}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b bg-primary/[0.03] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><CardTitle className="flex items-center gap-2 text-base"><Workflow className="h-5 w-5 text-primary" />Agentic planning workspace</CardTitle><CardDescription className="mt-1">The prompt expresses intent. MCP availability, policy authorization and runtime state remain deterministic.</CardDescription></div>
            {generated && <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />New plan</Button>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4">{([["architect", "Architect", Sparkles], ["investigate", "Investigate", History], ["simulate", "Simulate", FlaskConical], ["execute", "Execute", Play]] as const).map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setMode(key)} className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition ${mode === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
        </CardHeader>
        <CardContent className="p-5">
          {mode === "architect" && <ArchitectView prompt={prompt} setPrompt={setPrompt} generating={generating} buildPlan={buildPlan} generated={generated} creatingRun={creatingRun} createRun={createRun} runId={runId} agentKey={agentKey} tools={tools} />}
          {mode === "investigate" && <InvestigationView generated={generated} runId={runId} tools={tools} />}
          {mode === "simulate" && <SimulationView generated={generated} tools={tools} />}
          {mode === "execute" && <ExecutionView generated={generated} runId={runId} tools={tools} />}
        </CardContent>
      </Card>
    </div>
  </div>;
}

function ArchitectView({ prompt, setPrompt, generating, buildPlan, generated, creatingRun, createRun, runId, agentKey, tools }: { prompt: string; setPrompt: (v: string) => void; generating: boolean; buildPlan: () => Promise<void>; generated: GeneratedAgentWorkflow | null; creatingRun: boolean; createRun: () => Promise<void>; runId: string | null; agentKey: string; tools: AgentToolAvailability[] }) {
  const availableNames = new Set(tools.filter((tool) => tool.available).map((tool) => tool.name));
  const mappedTools = generated?.steps.map((step) => tools.find((tool) => tool.capability === step.capability && tool.provider === step.provider)).filter((tool): tool is AgentToolAvailability => Boolean(tool)) ?? [];
  return <div className="space-y-5">
    <div className="rounded-xl border bg-background p-4 shadow-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Describe the outcome</div>
      <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: Reduce unused licenses without impacting active users." className="min-h-28 resize-none border-0 p-0 text-base shadow-none focus-visible:ring-0" maxLength={6000} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"><span className="text-xs text-muted-foreground">Intent → capabilities → tools → policy → workflow → run</span><Button onClick={() => void buildPlan()} disabled={generating || !prompt.trim()}>{generating ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Building plan…</> : <><Sparkles className="mr-1.5 h-4 w-4" />Build agentic plan</>}</Button></div>
    </div>
    {generated ? <div className="space-y-3">
      <div className="rounded-xl border bg-muted/20 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-semibold">{generated.summary}</div><div className="mt-1 text-xs text-muted-foreground">Trigger: {generated.trigger}</div></div><Badge variant="outline">{generated.steps.length} steps</Badge></div></div>
      {generated.steps.map((step, index) => <div key={step.id} className="flex gap-3 rounded-xl border bg-background p-4"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">{index + 1}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-sm font-semibold">{step.name}</div>{step.requiresApproval && <Badge variant="secondary" className="text-[10px]">Approval required</Badge>}</div><div className="mt-1 text-[11px] text-muted-foreground">{step.provider ?? "Aegis"} · {step.capability ?? step.type}</div><div className="mt-2 text-sm">{step.action}</div>{step.verification && <div className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">Verification: {step.verification}</div>}<div className="mt-2 flex flex-wrap gap-1.5">{mappedTools[index] ? <Badge variant="outline" className="gap-1 text-[10px]"><Wrench className="h-3 w-3" />{mappedTools[index].title}</Badge> : <Badge variant="outline" className="gap-1 text-[10px]"><CircleAlert className="h-3 w-3" />No exact MCP mapping</Badge>}{step.capability && availableNames.has(step.capability) && <Badge variant="outline" className="gap-1 text-[10px]"><ShieldCheck className="h-3 w-3" />Capability available</Badge>}</div></div></div>)}
      <div className="grid gap-3 md:grid-cols-2"><ToolPlanSummary tools={tools} /> <PolicySummary /></div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void createRun()} disabled={creatingRun}>{creatingRun && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Create governed run <ArrowRight className="ml-1.5 h-4 w-4" /></Button><Button variant="outline" asChild><Link to="/agent/$agentKey" params={{ agentKey }}>Review agent configuration</Link></Button></div>
      {runId && <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-xs"><div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-success" />Durable run created: <span className="font-mono">{runId}</span></div><div className="mt-1 text-muted-foreground">No provider mutation occurs when a run is created.</div></div>}
    </div> : <div className="grid gap-3 md:grid-cols-3"><Feature title="Investigate" text="Provider-backed evidence is collected through authorized capabilities." icon={History} /><Feature title="Decide" text="Deterministic policies evaluate facts outside the model." icon={ShieldCheck} /><Feature title="Prove" text="Approval, execution and verification become durable runtime stages." icon={CheckCircle2} /></div>}
  </div>;
}

function ToolPlanSummary({ tools }: { tools: AgentToolAvailability[] }) {
  const available = tools.filter((tool) => tool.available);
  return <div className="rounded-xl border p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Wrench className="h-4 w-4" />MCP plan surface</div><div className="mt-1 text-xs text-muted-foreground">Only tools already exposed through Aegis governance can be used by the runtime.</div><div className="mt-3 space-y-2">{available.slice(0, 5).map((tool) => <div key={tool.name} className="flex items-center justify-between gap-2 text-xs"><span>{tool.title}</span><Badge variant="outline" className="text-[9px]">{tool.readOnly ? "read" : "approval"}</Badge></div>)}{!available.length && <div className="text-xs text-muted-foreground">No tool is currently available for this agent.</div>}</div></div>;
}

function PolicySummary() {
  return <div className="rounded-xl border p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />Governance stack</div><div className="mt-1 text-xs text-muted-foreground">Tool visibility never becomes permission by itself.</div><div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><Badge variant="outline">Capability binding</Badge><Badge variant="outline">Policy engine</Badge><Badge variant="outline">Guardrails</Badge><Badge variant="outline">Approval gate</Badge></div></div>;
}

function InvestigationView({ generated, runId, tools }: { generated: GeneratedAgentWorkflow | null; runId: string | null; tools: AgentToolAvailability[] }) { if (!generated) return <EmptyMode icon={History} title="Investigation starts from a plan" text="Build an agentic plan first." />; return <div className="space-y-4"><SectionIntro icon={History} title="Durable investigation" text={runId ? "This plan is persisted as a runtime run. The monitor executes only the tools authorized for the selected agent." : "Create a governed run from the Architect view before collecting evidence."} /><div className="grid gap-3 md:grid-cols-2">{["Agent purpose and enabled capabilities", "Tenant policy and governance constraints", "Provider evidence required by each workflow step", "Verification criteria defined by the plan"].map((item, index) => <div key={item} className="rounded-lg border p-4"><div className="text-xs font-semibold text-muted-foreground">EVIDENCE {index + 1}</div><div className="mt-1 text-sm">{item}</div><Badge className="mt-3" variant="outline">Runtime stage</Badge></div>)}</div><div className="rounded-lg border bg-muted/20 p-3 text-xs"><div className="flex items-center gap-2 font-medium"><Eye className="h-4 w-4" />Tool authorization snapshot</div><div className="mt-1 text-muted-foreground">{tools.filter((tool) => tool.available).length} MCP tools are currently available to this agent; unavailable tools are blocked rather than synthesized.</div></div>{runId && <Button asChild><Link to="/agent-run/$runId" params={{ runId }}>Open runtime monitor <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>}</div>; }
function SimulationView({ generated, tools }: { generated: GeneratedAgentWorkflow | null; tools: AgentToolAvailability[] }) { if (!generated) return <EmptyMode icon={FlaskConical} title="Simulation is ready after planning" text="Generate a workflow to see the production-safe simulation view." />; const gates = generated.steps.filter((step) => step.requiresApproval).length; return <div className="space-y-4"><SectionIntro icon={FlaskConical} title="Production-safe simulation" text="Review workflow impact and tool coverage without executing external mutations." /><div className="grid gap-3 sm:grid-cols-4"><Stat label="Workflow steps" value={String(generated.steps.length)} /><Stat label="Approval gates" value={String(gates)} /><Stat label="Available MCP tools" value={String(tools.filter((tool) => tool.available).length)} /><Stat label="Production mutations" value="0" /></div></div>; }
function ExecutionView({ generated, runId, tools }: { generated: GeneratedAgentWorkflow | null; runId: string | null; tools: AgentToolAvailability[] }) { if (!generated) return <EmptyMode icon={Play} title="Execution is governed" text="Generate and review a plan before requesting execution." />; const writeTools = tools.filter((tool) => !tool.readOnly && tool.available); return <div className="space-y-4"><SectionIntro icon={Play} title="Governed execution" text="AI planning stops before execution. Mutations require policy, approval, a trusted capability and verification." /><div className="rounded-lg border bg-muted/20 p-4"><div className="text-sm font-semibold">Execution boundary</div><div className="mt-1 text-xs text-muted-foreground">{writeTools.length ? `${writeTools.length} approval-gated write/proposal tool(s) are exposed to the selected agent.` : "No write/proposal MCP tool is currently available to this agent."} A plan alone never authorizes production execution.</div></div>{runId ? <Button asChild><Link to="/agent-run/$runId" params={{ runId }}>Review governed run <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button> : <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">Create a governed run first. A plan alone never authorizes production execution.</div>}</div>; }
function Feature({ title, text, icon: Icon }: { title: string; text: string; icon: ComponentType<{ className?: string }> }) { return <div className="rounded-xl border p-4"><Icon className="h-4 w-4 text-primary" /><div className="mt-2 text-sm font-semibold">{title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{text}</div></div>; }
function SectionIntro({ icon: Icon, title, text }: { icon: ComponentType<{ className?: string }>; title: string; text: string }) { return <div className="flex gap-3 rounded-xl border bg-primary/[0.03] p-4"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><div className="text-sm font-semibold">{title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{text}</div></div></div>; }
function EmptyMode({ icon: Icon, title, text }: { icon: ComponentType<{ className?: string }>; title: string; text: string }) { return <div className="rounded-xl border border-dashed p-10 text-center"><Icon className="mx-auto h-6 w-6 text-muted-foreground" /><div className="mt-3 text-sm font-semibold">{title}</div><div className="mt-1 text-xs text-muted-foreground">{text}</div></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border p-4"><div className="text-xl font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>; }
