import { ChevronDown, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { getRiskBreakdown } from '@/lib/risk-transparency';

export function RiskBreakdown({ risk }: { risk: unknown }) {
  const [open, setOpen] = useState(false);
  const factors = getRiskBreakdown(risk);
  if (!factors.length) return null;
  return <div className="mt-2 rounded-md border bg-muted/20">
    <button type="button" onClick={() => setOpen(v=>!v)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium">
      <span className="flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5"/> Why this risk score?</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${open?'rotate-180':''}`}/>
    </button>
    {open && <div className="space-y-2 border-t px-3 py-2">{factors.map(f => <div key={f.key} className="grid grid-cols-[1fr_auto_auto] items-start gap-2 text-xs">
      <div><div className="font-medium">{f.label}</div>{f.evidence && <div className="text-muted-foreground">{f.evidence}</div>}</div>
      <Badge variant="outline">Weight {f.weight}</Badge><Badge variant="outline">+{f.contribution}</Badge>
    </div>)}</div>}
  </div>;
}
