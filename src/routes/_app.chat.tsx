import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, CheckCircle2, ChevronRight, ShieldCheck, Sparkles, User as UserIcon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { executeEnterpriseChat, type EnterpriseChatMessage } from "@/lib/enterprise-chat.functions";
import { createChangeFromRecommendation } from "@/lib/change-recommendation.functions";
import { pageHead } from "@/lib/seo";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/chat")({ head: () => pageHead({ path: "/chat", title: "Aegis Enterprise AI", description: "Enterprise analysis, recommendations and evidence from connected systems." }), component: ChatPage });

type Recommendation = { title?: string; rationale?: string; impact?: string; risk?: string; nextStep?: string };
type Result = { answer?: string; analysis?: string; recommendations?: Recommendation[]; sources?: string[]; confidence?: number; actionRequired?: boolean; fetchedAt?: string };
type Message = EnterpriseChatMessage & { result?: Result };

function ChatPage() {
  const chat = useServerFn(executeEnterpriseChat);
  const createChange = useServerFn(createChangeFromRecommendation);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "I’m Aegis Enterprise AI. I can analyze the live connected workspace, explain the evidence, identify risks and recommend next actions. I will never invent data or claim a change was executed." }]);
  const [input, setInput] = useState("");
  const [sentRecommendations, setSentRecommendations] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  const mutation = useMutation({ mutationFn: (next: EnterpriseChatMessage[]) => chat({ data: { messages: next } }), onSuccess: (result) => { if (result.ok) setMessages((current) => [...current, { role: "assistant", content: result.answer ?? "Analysis complete.", result }]); } });
  const send = (text: string) => { const content = text.trim(); if (!content || mutation.isPending) return; const next = [...messages.map(({ role, content: value }) => ({ role, content: value })), { role: "user" as const, content }]; setMessages((current) => [...current, { role: "user", content }]); setInput(""); mutation.mutate(next); };
  const submitRecommendation = async (recommendation: Recommendation, key: string) => {
    if (sentRecommendations.has(key)) return;
    try {
      const result = await createChange({ data: recommendation });
      if (!result.ok) { toast.error("Could not send recommendation to approvals", { description: result.error }); return; }
      setSentRecommendations((current) => new Set(current).add(key));
      toast.success("Sent to approvals", { description: result.id, action: { label: "Open", onClick: () => { window.location.href = `/approvals/${result.id}`; } } });
    } catch (error) { toast.error("Could not create change record", { description: error instanceof Error ? error.message : "Please retry." }); }
  };

  return <div className="flex h-[calc(100vh-7rem)] flex-col"><PageHeader title="Aegis Enterprise AI" description="Analysis + evidence + recommendations across connected enterprise systems." actions={<div className="flex items-center gap-2"><Badge variant="outline" className="gap-1.5 border-success/40 text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Live data</Badge><Badge variant="outline">Human approval required</Badge></div>} />
    <Card className="flex flex-1 flex-col overflow-hidden"><div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto p-6">{messages.map((m, i) => <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>{m.role === "assistant" ? <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Bot className="h-4 w-4" /></div> : null}<div className={`max-w-[90%] rounded-2xl ${m.role === "user" ? "bg-primary text-primary-foreground px-4 py-3" : "bg-muted/40 p-4"}`}><div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>{m.result && <AnalysisPanel result={m.result} sentRecommendations={sentRecommendations} onCreateChange={submitRecommendation} />}</div>{m.role === "user" ? <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"><UserIcon className="h-4 w-4" /></div> : null}</div>)}{mutation.isPending && <div className="flex gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Bot className="h-4 w-4" /></div><div className="rounded-2xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground">Gathering live evidence and analyzing risk…</div></div>}</div>
      {messages.length === 1 && <div className="border-t p-4"><div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3 w-3" /> Suggested analyses</div><div className="flex flex-wrap gap-2">{["What are the biggest license optimization opportunities right now?", "Analyze the current Genesys operational risks and recommend actions.", "Give me an executive summary of the connected workspace.", "Which changes should I send to the approval center?"] .map((q) => <button key={q} onClick={() => send(q)} className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">{q}</button>)}</div></div>}
      {mutation.isError && <div className="border-t p-3"><Alert variant="destructive"><AlertTitle>Enterprise AI unavailable</AlertTitle><AlertDescription>{mutation.error instanceof Error ? mutation.error.message : "Try again."}</AlertDescription></Alert></div>}
      <CardContent className="border-t p-3"><form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2"><Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder="Ask Aegis to analyze, compare, investigate or recommend…" className="min-h-[52px] resize-none" rows={1} disabled={mutation.isPending} /><Button type="submit" size="icon" disabled={!input.trim() || mutation.isPending}><ArrowUp className="h-4 w-4" /></Button></form><div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><ShieldCheck className="h-3 w-3" /> Grounded in authorized live data · no provider mutations from chat</div></CardContent></Card></div>;
}

function AnalysisPanel({ result, sentRecommendations, onCreateChange }: { result: Result; sentRecommendations: Set<string>; onCreateChange: (recommendation: Recommendation, key: string) => void }) {
  return <div className="mt-4 space-y-3 border-t pt-3"><Section title="Analysis">{result.analysis ?? "No additional analysis was returned."}</Section>{result.recommendations?.length ? <div><div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3 w-3" /> Recommendations</div><div className="space-y-2">{result.recommendations.map((r, i) => { const key = `${r.title ?? "recommendation"}-${i}`; const sent = sentRecommendations.has(key); return <div key={key} className="rounded-lg border bg-background p-3"><div className="flex items-start gap-2"><ChevronRight className="mt-0.5 h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{r.title}</div><div className="mt-1 text-xs text-muted-foreground">{r.rationale}</div><div className="mt-2 flex flex-wrap gap-2 text-[11px]"><Badge variant="outline">Risk: {r.risk ?? "not classified"}</Badge><Badge variant="outline">Impact: {r.impact ?? "not quantified"}</Badge></div><div className="mt-2 text-xs"><span className="font-medium">Next step:</span> {r.nextStep ?? "Not specified"}</div><Button size="sm" variant={sent ? "secondary" : "outline"} className="mt-3" disabled={sent} onClick={() => onCreateChange(r, key)}>{sent ? "✓ Sent to approvals" : "Create change record"}</Button></div></div></div>; })}</div></div> : null}<div className="grid gap-2 sm:grid-cols-2"><Section title="Evidence sources">{result.sources?.length ? result.sources.join("\n") : "Connected live workspace telemetry"}</Section><Section title="Confidence"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> {result.confidence ?? 0}%</div></Section></div></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <div><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div><div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">{children}</div></div>; }
