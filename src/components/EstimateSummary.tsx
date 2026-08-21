import { DollarSign, Timer } from 'lucide-react';

export function EstimateSummary({ cost, currency, savings, downtimeMinutes }: { cost?:number|null; currency?:string|null; savings?:number|null; downtimeMinutes?:number|null }) {
  const money = (value:number|null|undefined) => value == null ? 'Not estimated' : `${currency ?? 'Unknown currency'} ${value.toLocaleString()}`;
  return <div className="grid gap-3 sm:grid-cols-3">
    <div className="rounded-lg border p-3"><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="h-3.5 w-3.5"/> Estimated cost</div><div className="text-sm font-medium">{money(cost)}</div></div>
    <div className="rounded-lg border p-3"><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="h-3.5 w-3.5"/> Estimated savings</div><div className="text-sm font-medium">{money(savings)}</div></div>
    <div className="rounded-lg border p-3"><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Timer className="h-3.5 w-3.5"/> Impact duration</div><div className="text-sm font-medium">{downtimeMinutes == null ? 'Not estimated' : `${downtimeMinutes} min`}</div></div>
  </div>;
}
