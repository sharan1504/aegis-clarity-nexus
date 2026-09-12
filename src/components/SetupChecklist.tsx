import { CheckCircle2, Circle, Plug, Bot, ShieldCheck } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function SetupChecklist({ providers, agents, guardrails }: { providers:number; agents:number; guardrails:number }) {
  const steps = [
    { done:providers > 0, label:'Connect a provider', href:'/integrations', icon:Plug },
    { done:agents > 0, label:'Deploy an agent', href:'/marketplace', icon:Bot },
    { done:guardrails > 0, label:'Configure a guardrail', href:'/guardrails', icon:ShieldCheck },
  ];
  if (steps.every(s => s.done)) return null;
  return <Card className="border-primary/20 bg-primary/[0.03]">
    <CardHeader><CardTitle className="text-base">Get Aegis ready</CardTitle><p className="text-sm text-muted-foreground">Your workspace is empty because no live providers or agents are configured yet.</p></CardHeader>
    <CardContent className="space-y-2">{steps.map(({done,label,href,icon:Icon}) => <Link key={label} to={href as never} className="flex items-center gap-3 rounded-lg border bg-background p-3 hover:border-primary/40">
      {done ? <CheckCircle2 className="h-4 w-4 text-success"/> : <Circle className="h-4 w-4 text-muted-foreground"/>}<Icon className="h-4 w-4 text-muted-foreground"/><span className="text-sm">{label}</span>
    </Link>)}</CardContent>
  </Card>;
}
