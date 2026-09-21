import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CenOpsMarkdownMessage } from "@/components/chat/CenOpsMarkdownMessage";
import { formatCenOpsResponse, type CenOpsResponse } from "@/lib/cenops-response-intelligence";

export function CenOpsResponseRenderer({ response, onFollowUp }: { response: CenOpsResponse; onFollowUp?: (prompt: string) => void }) {
  const answer = formatCenOpsResponse(response);
  const actionable = response.recommendations.filter((item) => item.requiresApproval === true).slice(0, 5);

  return <div className="space-y-5">
    <CenOpsMarkdownMessage content={answer} className="text-[15px] leading-7" />

    {actionable.length > 0 && <div className="space-y-2 border-l-2 border-primary/30 pl-4">
      {actionable.map((item, index) => <div key={`${item.title}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{item.title}</span>
        <span className="text-muted-foreground">Approval required</span>
      </div>)}
    </div>}

    {response.followUps.length > 0 && <div className="flex flex-wrap gap-2 pt-1">
      {response.followUps.map((item, i) => item.route
        ? <Button key={i} asChild variant="outline" size="sm" className="rounded-full"><Link to={item.route as any}>{item.label}</Link></Button>
        : <Button key={i} variant="outline" size="sm" className="rounded-full" onClick={() => onFollowUp?.(item.prompt)}>{item.label}</Button>)}
    </div>}
  </div>;
}
