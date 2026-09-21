import { Check, ChevronDown } from "lucide-react";
import type { CenOpsResponse } from "@/lib/cenops-response-intelligence";
import { deriveCenOpsReasoning } from "@/lib/cenops-operational-reasoning";

export function CenOpsReasoningPanel({ response, intent, scope }: { response: CenOpsResponse; intent?: string; scope?: string }) {
  const reasoning = deriveCenOpsReasoning(response);
  const intentLabel = intent?.replaceAll("_", " ") || response.responseType.replaceAll("_", " ");
  return <details className="group mb-4 text-sm text-muted-foreground">
    <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 text-sm font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
      <span>Thinking</span>
      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
    </summary>
    <div className="space-y-2 border-l border-border pl-4 pt-1 text-xs leading-5">
      <div className="flex items-start gap-2"><Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span>Classified the request as <span className="font-medium text-foreground">{intentLabel}</span>.</span></div>
      {scope && <div className="flex items-start gap-2"><Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span>Using authorized <span className="font-medium text-foreground">{scope}</span> evidence scope.</span></div>}
      <div className="flex items-start gap-2"><Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span>Prepared a concise answer from available product knowledge and evidence.</span></div>
      {reasoning.verificationPlan.length > 0 && response.actionRequired && <div className="flex items-start gap-2"><Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span>Kept consequential next steps behind the existing approval flow.</span></div>}
    </div>
  </details>;
}
