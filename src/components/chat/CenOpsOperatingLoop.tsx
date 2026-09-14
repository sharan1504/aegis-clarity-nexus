import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDot, Clock3, GitBranch, ShieldCheck, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CenOpsMarkdownMessage } from "@/components/chat/CenOpsMarkdownMessage";
import type { CenOpsResponse } from "@/lib/cenops-response-intelligence";
import { deriveCenOpsOperationalContext, deriveCenOpsOperatingLoop } from "@/lib/cenops-operating-model";

const statusLabel = { complete: "Complete", active: "In progress", pending: "Pending", not_required: "Not required" } as const;

function StageIcon({ status }: { status: keyof typeof statusLabel }) {
  if (status === "complete") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "pending") return <Clock3 className="h-4 w-4" />;
  return <CircleDot className="h-4 w-4" />;
}

export function CenOpsOperatingLoop({ response }: { response: CenOpsResponse }) {
  const [view, setView] = useState<"executive" | "operations" | "technical">("executive");
  const context = useMemo(() => deriveCenOpsOperationalContext(response), [response]);
  const stages = useMemo(() => deriveCenOpsOperatingLoop(response), [response]);
  const priority = response.risks[0]?.severity ?? "info";

  return <div className="space-y-4">
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />CenOps decision brief</CardTitle>
          <div className="flex rounded-lg border bg-background p-1" role="tablist" aria-label="Decision brief view">
            {(["executive", "operations", "technical"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)} className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${view === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{item}</button>)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === "executive" && <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business decision</div><div className="mt-1 text-sm leading-6"><CenOpsMarkdownMessage content={response.executiveSummary} /></div></div>
          <div className="rounded-xl border bg-background p-3"><div className="text-xs text-muted-foreground">Risk posture</div><div className="mt-1 flex items-center gap-2 text-sm font-semibold capitalize"><Badge variant="outline">{priority}</Badge>{response.risks.length ? `${response.risks.length} material risk${response.risks.length === 1 ? "" : "s"}` : "No material risks surfaced"}</div><div className="mt-2 text-xs text-muted-foreground">Evidence confidence: {Math.round(response.confidence)}%</div></div>
        </div>}
        {view === "operations" && <div className="grid gap-3 md:grid-cols-2">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Affected systems</div><div className="mt-2 flex flex-wrap gap-2">{context.affectedServices.length ? context.affectedServices.map((item) => <Badge key={item} variant="secondary">{item}</Badge>) : <span className="text-sm text-muted-foreground">No affected system was established by the evidence.</span>}</div></div>
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business impact</div><div className="mt-2 space-y-1 text-sm text-muted-foreground">{context.businessImpact.length ? context.businessImpact.map((item) => <div key={item}>• {item}</div>) : <div>No material business impact was established.</div>}</div></div>
        </div>}
        {view === "technical" && <div className="grid gap-3 md:grid-cols-2">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence timeline</div><div className="mt-2 space-y-2">{context.timeline.length ? context.timeline.map((item, index) => <div key={`${item.label}-${index}`} className="rounded-lg border bg-background p-3"><div className="flex items-center justify-between gap-2 text-xs font-medium"><span>{item.label}</span>{item.timestamp && <span className="text-muted-foreground">{item.timestamp}</span>}</div><div className="mt-1 text-xs text-muted-foreground">{item.detail}</div></div>) : <div className="text-sm text-muted-foreground">No timestamped evidence was supplied.</div>}</div></div>
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Root-cause assessment</div><div className="mt-2 rounded-lg border bg-background p-3 text-sm text-muted-foreground">{context.rootCauseHypotheses.length ? context.rootCauseHypotheses.map((item) => <div key={item.title}><div className="font-medium text-foreground">{item.title}</div><div>{item.rationale}</div></div>) : "No root-cause hypothesis is presented because the current response does not establish one with sufficient evidence."}</div></div>
        </div>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><GitBranch className="h-4 w-4" />Observe → Decide → Govern → Verify</CardTitle></CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{stages.map((stage) => <div key={stage.key} className="rounded-lg border bg-background p-3"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-medium"><StageIcon status={stage.status} />{stage.label}</div><Badge variant="outline" className="text-[10px]">{statusLabel[stage.status]}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{stage.description}</div></div>)}</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4" />Next governed action</div><div className="mt-1 text-sm text-muted-foreground">{response.recommendations[0]?.nextStep ?? "No governed action is currently established."}</div><div className="mt-3 flex items-center gap-2"><Badge variant={response.actionRequired ? "outline" : "secondary"}>{response.actionRequired ? "Human approval required" : "No approval required"}</Badge>{response.recommendations[0]?.actionType && <Badge variant="outline">{response.recommendations[0].actionType}</Badge>}</div></div>
          <div className="rounded-xl border p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />Verification & learning</div><div className="mt-1 text-sm text-muted-foreground">{context.verificationPlan.length ? context.verificationPlan[0] : "Verification will be required after any approved production change."}</div><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">Feedback-driven improvement</Badge><Badge variant="outline">No autonomous retraining</Badge></div></div>
        </div>
      </CardContent>
    </Card>
  </div>;
}
