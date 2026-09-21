import { Check, ChevronDown } from "lucide-react";
import type { CenOpsResponse } from "@/lib/cenops-response-intelligence";
import { deriveCenOpsReasoning } from "@/lib/cenops-operational-reasoning";

function skillForIntent(intent?: string, responseType?: string) {
  const key = String(intent ?? responseType ?? "").toLowerCase();
  if (key.includes("integration")) return "cenops-integrations-guide";
  if (key.includes("investigat") || key.includes("incident")) return "cenops-operations-investigator";
  if (key.includes("how_to") || key.includes("how-to")) return "cenops-how-to-guide";
  if (key.includes("agent")) return "cenops-ai-agent-guide";
  if (key.includes("approval") || key.includes("govern")) return "cenops-governance-guide";
  return "cenops-platform-guide";
}

export function CenOpsReasoningPanel({
  response,
  intent,
  scope,
}: {
  response: CenOpsResponse;
  intent?: string;
  scope?: string;
}) {
  const reasoning = deriveCenOpsReasoning(response);
  const skill = skillForIntent(intent, response.responseType);

  return (
    <details className="mb-4 text-sm text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span>Thinking complete</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </summary>
      <div className="space-y-2 pl-0 pt-1 text-xs leading-5">
        <div className="flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-success" />
          <span>Using skill: <span className="font-medium text-foreground/75">{skill}</span></span>
        </div>
        {scope && (
          <div className="text-muted-foreground/80">
            Evidence scope: <span className="font-medium text-foreground/70">{scope}</span>
          </div>
        )}
        {reasoning.verificationPlan.length > 0 && response.actionRequired && (
          <div className="text-muted-foreground/80">
            Consequential next steps remain behind human approval.
          </div>
        )}
      </div>
    </details>
  );
}
