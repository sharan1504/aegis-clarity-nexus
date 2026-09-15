import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronRight, CircleAlert, Gauge, Lightbulb, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CenOpsMarkdownMessage } from "@/components/chat/CenOpsMarkdownMessage";
import { CenOpsOperatingLoop } from "@/components/chat/CenOpsOperatingLoop";
import type { CenOpsResponse, CenOpsSeverity } from "@/lib/cenops-response-intelligence";

const severityClass: Record<CenOpsSeverity, string> = { critical: "border-destructive/50 bg-destructive/5", high: "border-orange-500/40 bg-orange-500/5", medium: "border-yellow-500/40 bg-yellow-500/5", low: "border-primary/20 bg-primary/5", info: "border-border bg-muted/20" };
const SeverityIcon = ({ value }: { value?: CenOpsSeverity }) => value === "critical" || value === "high" ? <ShieldAlert className="h-4 w-4" /> : value === "medium" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />;

export function CenOpsResponseRenderer({ response, onFollowUp }: { response: CenOpsResponse; onFollowUp?: (prompt: string) => void }) {
  const compact = response.responseType === "product" || response.responseType === "how_to";
  const intelligenceResponse = response.responseType === "operational" || response.responseType === "investigation" || response.responseType === "executive";
  return <div className="space-y-4">
    <div className="rounded-xl border bg-background p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="outline">{response.responseType === "how_to" ? "Guidance" : response.responseType === "product" ? "CenOps capability" : response.responseType === "investigation" ? "Investigation" : "Operational intelligence"}</Badge>{response.confidence > 0 && <Badge variant="secondary">{Math.round(response.confidence)}% confidence</Badge>}</div>
      <CenOpsMarkdownMessage content={response.executiveSummary} />
    </div>

    {intelligenceResponse && <CenOpsOperatingLoop response={response} />}

    {response.metrics.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{response.metrics.slice(0, 8).map((metric, i) => <Card key={`${metric.label}-${i}`}><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Gauge className="h-3.5 w-3.5" />{metric.label}</div><div className="mt-1 text-xl font-semibold">{metric.value}</div>{metric.change && <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{metric.trend === "up" ? <ArrowUp className="h-3 w-3" /> : metric.trend === "down" ? <ArrowDown className="h-3 w-3" /> : null}{metric.change}</div>}</CardContent></Card>)}</div>}

    {response.keyFindings.length > 0 && <Card><CardHeader className="pb-3"><CardTitle className="text-base">Key findings</CardTitle></CardHeader><CardContent className="space-y-2">{response.keyFindings.slice(0, 8).map((finding, i) => <div key={`${finding.title}-${i}`} className="rounded-lg border p-3"><div className="flex items-start gap-2"><SeverityIcon value={finding.severity} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-sm font-medium">{finding.title}{finding.severity && <Badge variant="outline" className="text-[10px]">{finding.severity}</Badge>}{finding.status && <span className="text-xs font-normal text-muted-foreground">{finding.status}</span>}</div><div className="mt-1 text-sm text-muted-foreground"><CenOpsMarkdownMessage content={finding.detail} /></div></div></div></div>)}</CardContent></Card>}

    {!compact && response.risks.length > 0 && <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CircleAlert className="h-4 w-4" />Top risks</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{response.risks.slice(0, 6).map((risk, i) => <div key={`${risk.title}-${i}`} className={`rounded-xl border p-4 ${severityClass[risk.severity ?? "medium"]}`}><div className="flex items-center gap-2"><SeverityIcon value={risk.severity} /><div className="text-sm font-semibold">{risk.title}</div></div><div className="mt-2 text-xs font-medium">Why it matters</div><div className="mt-1 text-sm text-muted-foreground">{risk.whyItMatters}</div><div className="mt-2 text-xs font-medium">Impact</div><div className="mt-1 text-sm text-muted-foreground">{risk.impact}</div>{risk.evidence.length > 0 && <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">Evidence: {risk.evidence.join(" · ")}</div>}</div>)}</CardContent></Card>}

    {!compact && response.opportunities.length > 0 && <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4" />Opportunities</CardTitle></CardHeader><CardContent className="space-y-2">{response.opportunities.slice(0, 6).map((item, i) => <div key={`${item.title}-${i}`} className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm font-medium">{item.title}{item.value && <Badge variant="secondary">{item.value}</Badge>}</div><div className="mt-1 text-sm text-muted-foreground">{item.rationale}</div></div>)}</CardContent></Card>}

    {response.whatChanged.length > 0 && <Card><CardHeader className="pb-3"><CardTitle className="text-base">What changed</CardTitle></CardHeader><CardContent className="space-y-2">{response.whatChanged.map((item, i) => <div key={i} className="flex gap-2 text-sm"><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{item}</span></div>)}</CardContent></Card>}
    {response.whatRequiresAttention.length > 0 && <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4"><div className="text-sm font-semibold">Requires attention</div><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{response.whatRequiresAttention.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}

    {response.recommendations.length > 0 && <Card><CardHeader className="pb-3"><CardTitle className="text-base">Recommended next steps</CardTitle></CardHeader><CardContent className="space-y-3">{response.recommendations.slice(0, 6).map((item, i) => <div key={`${item.title}-${i}`} className="rounded-lg border p-4"><div className="flex flex-wrap items-center gap-2 text-sm font-semibold">{item.title}{item.requiresApproval && <Badge variant="outline">Approval required</Badge>}</div><div className="mt-1 text-sm text-muted-foreground">{item.rationale}</div><div className="mt-2 grid gap-2 text-xs sm:grid-cols-3"><div><span className="font-medium">Impact:</span> {item.impact}</div><div><span className="font-medium">Risk:</span> {item.risk}</div><div><span className="font-medium">Next:</span> {item.nextStep}</div></div></div>)}</CardContent></Card>}

    {response.evidence.length > 0 && <details className="rounded-xl border bg-muted/10 p-4"><summary className="cursor-pointer text-sm font-medium">Evidence & technical details ({response.evidence.length})</summary><div className="mt-3 space-y-2">{response.evidence.map((item, i) => <div key={`${item.source}-${i}`} className="rounded-lg border bg-background p-3"><div className="text-xs font-medium">{item.source}{item.timestamp && <span className="ml-2 font-normal text-muted-foreground">{item.timestamp}</span>}</div><div className="mt-1 text-sm text-muted-foreground">{item.detail}</div></div>)}</div></details>}

    {response.followUps.length > 0 && <div className="flex flex-wrap gap-2">{response.followUps.map((item, i) => item.route ? <Button key={i} asChild variant="outline" size="sm"><Link to={item.route as any}>{item.label}</Link></Button> : <Button key={i} variant="outline" size="sm" onClick={() => onFollowUp?.(item.prompt)}>{item.label}</Button>)}</div>}
  </div>;
}
