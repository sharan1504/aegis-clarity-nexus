import { CheckCircle2, ShieldAlert, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CenOpsResponse } from "@/lib/cenops-response-intelligence";
import { deriveCenOpsReasoning } from "@/lib/cenops-operational-reasoning";

const priorityLabel = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Informational" } as const;

export function CenOpsReasoningPanel({ response }: { response: CenOpsResponse }) {
  const reasoning = deriveCenOpsReasoning(response);
  return <Card className="border-primary/20 bg-primary/[0.02]">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4" />Operational assessment <Badge variant="outline">{priorityLabel[reasoning.priority]} priority</Badge></CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assessment</div><p className="mt-1 text-sm leading-6">{reasoning.assessment}</p></div>
      <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business impact</div><p className="mt-1 text-sm leading-6">{reasoning.businessImpact}</p></div>
      <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this assessment</div><ul className="mt-1 space-y-1 text-sm text-muted-foreground">{reasoning.rationale.map((item, index) => <li key={index} className="flex gap-2"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item}</li>)}</ul></div>
      <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verification plan</div><ul className="mt-1 space-y-1 text-sm text-muted-foreground">{reasoning.verificationPlan.map((item, index) => <li key={index} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item}</li>)}</ul></div>
    </CardContent>
  </Card>;
}
