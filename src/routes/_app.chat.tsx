import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, CheckCircle2, ChevronRight, MessageSquare, Plus, ShieldCheck, Sparkles, Trash2, User as UserIcon, Link2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { executeEnterpriseChat, type EnterpriseChatMessage } from "@/lib/enterprise-chat.functions";
import { createChatSession, deleteChatSession, getChatSession, listChatSessions, type ChatSession, type StoredChatMessage } from "@/lib/chat-history.functions";
import { createChangeFromRecommendation } from "@/lib/change-recommendation.functions";
import { pageHead } from "@/lib/seo";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/chat")({ head: () => pageHead({ path: "/chat", title: "Aegis Enterprise AI", description: "Enterprise analysis, recommendations and evidence from connected systems." }), component: ChatPage });

type Recommendation = { title?: string; rationale?: string; impact?: string; risk?: string; nextStep?: string };
type CorrelatedSignal = { title?: string; detail?: string; providers?: string[]; timestamp?: string };
type Result = { answer?: string; analysis?: string; recommendations?: Recommendation[]; sources?: string[]; correlatedSignals?: CorrelatedSignal[]; confidence?: number; actionRequired?: boolean; fetchedAt?: string };
type Message = EnterpriseChatMessage & { result?: Result; id?: string; createdAt?: string };

const suggestions = [
  "What are the biggest license optimization opportunities right now?",
  "Analyze the current Genesys operational risks and recommend actions.",
  "Give me an executive summary of the connected workspace.",
  "Which changes should I send to the approval center?",
];

function ChatPage() {
  const chat = useServerFn(executeEnterpriseChat);
  const createSession = useServerFn(createChatSession);
  const loadSessions = useServerFn(listChatSessions);
  const loadSession = useServerFn(getChatSession);
  const removeSession = useServerFn(deleteChatSession);
  const createChange = useServerFn(createChangeFromRecommendation);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sentRecommendations, setSentRecommendations] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshHistory = async () => {
    const result = await loadSessions();
    setSessions(result.sessions);
    return result.sessions;
  };

  const startNewChat = async () => {
    try {
      const result = await createSession();
      setSessionId(result.session.id);
      setMessages([]);
      await refreshHistory();
    } catch (error) {
      toast.error("Could not start a new chat", { description: error instanceof Error ? error.message : "Try again." });
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const existing = await refreshHistory();
        const result = await createSession();
        if (!active) return;
        setSessionId(result.session.id);
        setMessages([]);
        setSessions((current) => [result.session, ...current.filter((item) => item.id !== result.session.id)]);
        void existing;
      } catch (error) {
        if (active) toast.error("Chat history could not be loaded", { description: error instanceof Error ? error.message : "Try again." });
      } finally {
        if (active) setLoadingHistory(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const openSession = async (id: string) => {
    if (id === sessionId) return;
    try {
      const result = await loadSession({ data: { sessionId: id } });
      setSessionId(result.session.id);
      setMessages(result.messages.map((message: StoredChatMessage) => ({ role: message.role, content: message.content, result: message.result as Result | undefined, id: message.id, createdAt: message.createdAt })));
      setSentRecommendations(new Set());
    } catch (error) {
      toast.error("Could not open chat", { description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const mutation = useMutation({
    mutationFn: (next: EnterpriseChatMessage[]) => {
      if (!sessionId) throw new Error("Start a chat session first.");
      return chat({ data: { sessionId, messages: next } });
    },
    onSuccess: async (result) => {
      if (result.ok) {
        setMessages((current) => [...current, { role: "assistant", content: (result as { answer?: string }).answer ?? "Analysis complete.", result: result as never }]);
        await refreshHistory();
      }
    },
  });

  const send = (text: string) => {
    const content = text.trim();
    if (!content || mutation.isPending || !sessionId) return;
    const next = [...messages.map(({ role, content: value }) => ({ role, content: value })), { role: "user" as const, content }];
    setMessages((current) => [...current, { role: "user", content }]);
    setInput("");
    mutation.mutate(next);
  };

  const remove = async (id: string) => {
    try {
      await removeSession({ data: { sessionId: id } });
      const remaining = await refreshHistory();
      if (id === sessionId) {
        const replacement = remaining[0];
        if (replacement) await openSession(replacement.id);
        else await startNewChat();
      }
    } catch (error) {
      toast.error("Could not delete chat", { description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const submitRecommendation = async (recommendation: Recommendation, key: string) => {
    if (sentRecommendations.has(key)) return;
    try {
      const result = await createChange({ data: recommendation });
      if (!result.ok) { toast.error("Could not send recommendation to approvals", { description: result.error }); return; }
      setSentRecommendations((current) => new Set(current).add(key));
      toast.success("Sent to approvals", { description: result.id, action: { label: "Open", onClick: () => { window.location.href = `/approvals/${result.id}`; } } });
    } catch (error) { toast.error("Could not create change record", { description: error instanceof Error ? error.message : "Please retry." }); }
  };

  return <div className="flex h-[calc(100vh-7rem)] flex-col">
    <PageHeader title="Aegis Enterprise AI" description="Analysis + evidence + recommendations across connected enterprise systems." actions={<div className="flex items-center gap-2"><Badge variant="outline" className="gap-1.5 border-success/40 text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Live data</Badge><Badge variant="outline">Human approval required</Badge></div>} />
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="hidden min-h-0 overflow-hidden lg:flex lg:flex-col">
        <div className="flex items-center justify-between border-b p-3"><div className="text-sm font-semibold">Chat history</div><Button size="icon" variant="outline" onClick={() => void startNewChat()} title="New chat"><Plus className="h-4 w-4" /></Button></div>
        <div className="border-b p-2"><Button variant="outline" className="w-full justify-start" onClick={() => void startNewChat()}><MessageSquare className="mr-2 h-4 w-4" /> New chat</Button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loadingHistory ? <div className="p-4 text-xs text-muted-foreground">Loading history…</div> : sessions.length ? sessions.map((item) => <div key={item.id} className={`group mb-1 flex items-center rounded-lg border ${item.id === sessionId ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted/40"}`}><button className="min-w-0 flex-1 px-3 py-2 text-left" onClick={() => void openSession(item.id)}><div className="truncate text-xs font-medium">{item.title}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(item.updatedAt).toLocaleString()}</div></button><Button variant="ghost" size="icon" className="mr-1 h-7 w-7 opacity-60 hover:opacity-100" onClick={() => void remove(item.id)} title="Delete chat"><Trash2 className="h-3.5 w-3.5" /></Button></div>) : <div className="p-4 text-xs text-muted-foreground">No saved chats yet.</div>}
        </div>
        <div className="border-t p-3 text-[10px] text-muted-foreground">No application-level history limit. Chats remain available until you delete them.</div>
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          {!messages.length && <div className="rounded-xl border border-dashed p-5"><div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Start a new analysis</div><p className="mt-1 text-xs text-muted-foreground">Every new chat starts as an independent session. You can return to any saved conversation from the history panel.</p><div className="mt-4 flex flex-wrap gap-2">{suggestions.map((q) => <button key={q} onClick={() => send(q)} className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">{q}</button>)}</div></div>}
          {messages.map((m, i) => <div key={m.id ?? `${m.createdAt ?? "message"}-${i}`} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>{m.role === "assistant" ? <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Bot className="h-4 w-4" /></div> : null}<div className={`max-w-[90%] rounded-2xl ${m.role === "user" ? "bg-primary text-primary-foreground px-4 py-3" : "bg-muted/40 p-4"}`}><div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>{m.result && <AnalysisPanel result={m.result} sentRecommendations={sentRecommendations} onCreateChange={submitRecommendation} />}</div>{m.role === "user" ? <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"><UserIcon className="h-4 w-4" /></div> : null}</div>)}
          {mutation.isPending && <div className="flex gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Bot className="h-4 w-4" /></div><div className="rounded-2xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground">Gathering live evidence and analyzing risk…</div></div>}
        </div>
        {mutation.isError && <div className="border-t p-3"><Alert variant="destructive"><AlertTitle>Enterprise AI unavailable</AlertTitle><AlertDescription>{mutation.error instanceof Error ? mutation.error.message : "Try again."}</AlertDescription></Alert></div>}
        <CardContent className="border-t p-3"><form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2"><Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder="Ask Aegis to analyze, compare, investigate or recommend…" className="min-h-[52px] resize-none" rows={1} disabled={mutation.isPending || !sessionId} /><Button type="submit" size="icon" disabled={!input.trim() || mutation.isPending || !sessionId}><ArrowUp className="h-4 w-4" /></Button></form><div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><ShieldCheck className="h-3 w-3" /> Grounded in authorized live data · no provider mutations from chat</div></CardContent>
      </Card>
    </div>
  </div>;
}

function AnalysisPanel({ result, sentRecommendations, onCreateChange }: { result: Result; sentRecommendations: Set<string>; onCreateChange: (recommendation: Recommendation, key: string) => void }) {
  const correlations = result.correlatedSignals?.filter((signal) => signal.title && signal.detail && signal.providers?.length) ?? [];
  return <div className="mt-4 space-y-3 border-t pt-3"><Section title="Analysis">{result.analysis ?? "No additional analysis was returned."}</Section>{correlations.length ? <div><div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Link2 className="h-3 w-3" /> Correlated signals</div><div className="space-y-2">{correlations.map((signal, i) => <div key={`${signal.title}-${i}`} className="rounded-lg border bg-background p-3"><div className="text-sm font-medium">{signal.title}</div><div className="mt-1 text-xs text-muted-foreground">{signal.detail}</div><div className="mt-2 flex flex-wrap gap-1">{signal.providers!.map((provider) => <Badge key={provider} variant="outline">{provider}</Badge>)}{signal.timestamp && <Badge variant="secondary">{new Date(signal.timestamp).toLocaleString()}</Badge>}</div></div>)}</div></div> : null}{result.recommendations?.length ? <div><div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3 w-3" /> Recommendations</div><div className="space-y-2">{result.recommendations.map((r, i) => { const key = `${r.title ?? "recommendation"}-${i}`; const sent = sentRecommendations.has(key); return <div key={key} className="rounded-lg border bg-background p-3"><div className="flex items-start gap-2"><ChevronRight className="mt-0.5 h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{r.title}</div><div className="mt-1 text-xs text-muted-foreground">{r.rationale}</div><div className="mt-2 flex flex-wrap gap-2 text-[11px]"><Badge variant="outline">Risk: {r.risk ?? "not classified"}</Badge><Badge variant="outline">Impact: {r.impact ?? "not quantified"}</Badge></div><div className="mt-2 text-xs"><span className="font-medium">Next step:</span> {r.nextStep ?? "Not specified"}</div><Button size="sm" variant={sent ? "secondary" : "outline"} className="mt-3" disabled={sent} onClick={() => onCreateChange(r, key)}>{sent ? "✓ Sent to approvals" : "Create change record"}</Button></div></div></div>; })}</div></div> : null}<div className="grid gap-2 sm:grid-cols-2"><Section title="Evidence sources">{result.sources?.length ? result.sources.join("\n") : "Connected live workspace telemetry"}</Section><Section title="Confidence"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> {result.confidence ?? 0}%</div></Section></div></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <div><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div><div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">{children}</div></div>; }
