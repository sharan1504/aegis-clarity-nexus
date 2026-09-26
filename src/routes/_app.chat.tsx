import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowUp, BookOpen, Bot, ClipboardCheck, Compass, FileText, Link2, Maximize2, PanelLeftClose, PanelLeftOpen, Plus, Plug, Search, ShieldAlert, Sparkles, Square, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CenOpsMarkdownMessage } from "@/components/chat/CenOpsMarkdownMessage";
import { CenOpsResponseRenderer } from "@/components/chat/CenOpsResponseRenderer";
import { CenOpsReasoningPanel } from "@/components/chat/CenOpsReasoningPanel";
import { executeEnterpriseChat, type EnterpriseChatMessage } from "@/lib/enterprise-chat.functions";
import type { CenOpsResponse } from "@/lib/cenops-response-intelligence";
import { createChatSession, deleteChatSession, getChatSession, getMyDepartments, listChatSessions, updateChatSessionTitle, type ChatSession, type StoredChatMessage } from "@/lib/chat-history.functions";
import { createChangeFromRecommendation } from "@/lib/change-recommendation.functions";
import { pageHead } from "@/lib/seo";
import { toast } from "sonner";
import { FeatureHelpButton } from "@/components/onboarding/FeatureHelpDrawer";

export const Route = createFileRoute("/_app/chat")({ head: () => pageHead({ path: "/chat", title: "CenOps Copilot", description: "Evidence-grounded operational analysis for enterprise operations." }), component: ChatPage });
type Recommendation = { title?: string; rationale?: string; impact?: string; risk?: string; nextStep?: string; actionType?: string; requiresApproval?: boolean };
type Result = { demo?: boolean; answer?: string; analysis?: string; recommendations?: Recommendation[]; sources?: string[]; confidence?: number; actionRequired?: boolean; investigationId?: string; response?: CenOpsResponse; intent?: string };
type Message = EnterpriseChatMessage & { result?: Result; id?: string; createdAt?: string };
const suggestions = [
  { label: "What can CenOps do?", prompt: "What can CenOps do? Give me a practical tour of the core features and explain where I should start.", Icon: Sparkles },
  { label: "Walk me through Command Center", prompt: "Walk me through Command Center and explain what I should look at first.", Icon: Compass },
  { label: "Which agent should I try first?", prompt: "Which AI agent should I try first in this workspace, and what does it demonstrate?", Icon: Bot },
  { label: "What do I need to connect for license optimization?", prompt: "What integrations and evidence do I need for license optimization, especially the Genesys license workflow?", Icon: Plug },
  { label: "Investigate an incident", prompt: "Investigate the most important operational incident affecting this workspace right now.", Icon: ShieldAlert },
  { label: "Review approvals", prompt: "Review the pending approvals and highlight anything that needs attention.", Icon: ClipboardCheck },
];
const cleanAssistantText = (value: string) => value.replace(/<svg[\s\S]*?<\/svg>/gi, "").replace(/<[^>]+>/g, "").replace(/(^|\n)\s*svg\s*(?=\n|$)/gi, "").replace(/\n{3,}/g, "\n\n").trim();
const buildChatTitle = (message: string) => {
  const text = message.replace(/[?!.:,;]+/g, " ").replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const known: Array<[RegExp, string]> = [
    [/license|entitlement/, "License Optimization"],
    [/integration|connector|connect|jira|slack|salesforce|snowflake|genesys|aws|hubspot/, "Integration & Connectors"],
    [/approval|human.?in.?the.?loop/, "Approval Center"],
    [/guardrail|governance|policy/, "Guardrails & Governance"],
    [/agent|copilot|agentic/, "AI Agents"],
    [/incident|outage|failure|error|degraded/, "Incident Investigation"],
    [/vulnerab|security|exposure/, "Security & Vulnerabilities"],
    [/analytic|trend|report|metric/, "Operations Analytics"],
    [/platform|capabilit|feature|overview/, "CenOps Platform Overview"],
  ];
  const match = known.find(([pattern]) => pattern.test(lower));
  if (match) return match[1];
  const stop = new Set(["tell", "me", "more", "about", "this", "the", "a", "an", "and", "or", "please", "can", "you", "what", "how", "does", "do", "is", "are", "to", "for", "on", "of", "with", "show", "explain"]);
  const words = text.split(" ").filter((word) => !stop.has(word.toLowerCase())).slice(0, 5);
  const title = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return title || "CenOps Conversation";
};
const featureReferencesFor = (text: string) => {
  const lower = text.toLowerCase();
  const refs = [
    lower.includes("integration") || /jira|slack|salesforce|snowflake|genesys|aws|connector/.test(lower) ? { label: "Integrations", to: "/integrations" as const } : null,
    lower.includes("agent") || lower.includes("copilot") ? { label: "AI Agents", to: "/agents" as const } : null,
    lower.includes("govern") || lower.includes("guardrail") ? { label: "Guardrails", to: "/governance" as const } : null,
    lower.includes("approval") || lower.includes("human-in-the-loop") ? { label: "Approval Center", to: "/approvals" as const } : null,
    lower.includes("incident") || lower.includes("operational") || lower.includes("command center") ? { label: "Command Center", to: "/" as const } : null,
    lower.includes("analytic") || lower.includes("report") || lower.includes("metric") ? { label: "Analytics", to: "/analytics" as const } : null,
    lower.includes("vulnerab") || lower.includes("security") ? { label: "Vulnerabilities", to: "/investigations" as const } : null,
  ].filter(Boolean) as Array<{ label: string; to: "/" | "/analytics" | "/agents" | "/approvals" | "/governance" | "/integrations" | "/investigations" }>;
  return refs.filter((item, index) => refs.findIndex((candidate) => candidate.to === item.to) === index).slice(0, 5);
};
function ChatPage() {
  const { user } = Route.useRouteContext();
  const firstName = useMemo(() => {
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    const name = typeof metadata?.full_name === "string" ? metadata.full_name : typeof metadata?.name === "string" ? metadata.name : "";
    return name.trim().split(/\s+/)[0] ?? "";
  }, [user]);
  const chat = useServerFn(executeEnterpriseChat); const createSession = useServerFn(createChatSession); const renameSession = useServerFn(updateChatSessionTitle); const loadSessions = useServerFn(listChatSessions); const loadSession = useServerFn(getChatSession); const loadDepartments = useServerFn(getMyDepartments); const removeSession = useServerFn(deleteChatSession); const createChange = useServerFn(createChangeFromRecommendation);
  const [sessions, setSessions] = useState<ChatSession[]>([]); const [sessionId, setSessionId] = useState<string | null>(null); const [messages, setMessages] = useState<Message[]>([]); const [input, setInput] = useState(""); const [depth, setDepth] = useState<"quick" | "thorough">("thorough"); const [inputFocused, setInputFocused] = useState(false); const [hasTyped, setHasTyped] = useState(false); const [placeholderIndex, setPlaceholderIndex] = useState(0); const [departments, setDepartments] = useState<Array<{ department_key: string; display_name: string }>>([]); const [departmentKey, setDepartmentKey] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [historyOpen, setHistoryOpen] = useState(true); const [historyQuery, setHistoryQuery] = useState("");
  const refreshHistory = async () => { const result = await loadSessions(); setSessions(result.sessions); return result.sessions; };
  const startNewChat = async (requestedDepartment = departmentKey) => { try { const result = await createSession({ data: { departmentKey: requestedDepartment } }); setSessionId(result.session.id); setDepartmentKey(result.session.departmentKey); setMessages([]); setInput(""); setHasTyped(false); setInputFocused(false); setPlaceholderIndex(0); setHistoryQuery(""); await refreshHistory(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start chat."); } };
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [existing, dept] = await Promise.all([refreshHistory(), loadDepartments()]);
        if (!active) return;
        setDepartments(dept.departments.map((d: any) => ({ department_key: d.department_key, display_name: d.display_name })));
        setDepartmentKey(dept.selected);
        const pending = existing.find((session) => session.title === "New chat");
        if (pending) {
          const result = await loadSession({ data: { sessionId: pending.id } });
          if (!active) return;
          setSessionId(result.session.id);
          setDepartmentKey(result.session.departmentKey);
          setMessages(result.messages.map((m: StoredChatMessage) => ({ role: m.role, content: cleanAssistantText(m.content), result: m.result as Result | undefined, id: m.id, createdAt: m.createdAt })));
        } else {
          const result = await createSession({ data: { departmentKey: dept.selected } });
          if (!active) return;
          setSessionId(result.session.id);
          setDepartmentKey(result.session.departmentKey);
          setMessages([]);
          await refreshHistory();
        }
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Chat history could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);
  const mutation = useMutation({ mutationFn: (next: EnterpriseChatMessage[]) => chat({ data: { sessionId: sessionId!, messages: next, depth } }), onSuccess: async (result) => { if (result.ok) { setMessages((current) => [...current, { role: "assistant", content: cleanAssistantText(result.answer ?? "Analysis complete."), result: result as Result }]); await refreshHistory(); } else toast.error(result.error); } });
  const send = (text: string) => {
  const content = text.trim();
  if (!content || mutation.isPending || !sessionId) return;
  const isFirstMessage = messages.length === 0;
  const next = [...messages.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content }];
  setMessages((current) => [...current, { role: "user", content }]);
  setInput("");
  if (isFirstMessage) {
    const title = buildChatTitle(content);
    void renameSession({ data: { sessionId, title } }).then(() => refreshHistory()).catch((error) => toast.error(error instanceof Error ? error.message : "Could not name chat."));
  }
  mutation.mutate(next);
};
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(input); } };
  const openSession = async (id: string) => { try { const result = await loadSession({ data: { sessionId: id } }); setSessionId(result.session.id); setDepartmentKey(result.session.departmentKey); setMessages(result.messages.map((m: StoredChatMessage) => ({ role: m.role, content: cleanAssistantText(m.content), result: m.result as Result | undefined, id: m.id, createdAt: m.createdAt }))); setHistoryQuery(""); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open chat."); } };
  const remove = async (id: string) => { try { await removeSession({ data: { sessionId: id } }); const remaining = await refreshHistory(); if (id === sessionId) { if (remaining[0]) await openSession(remaining[0].id); else await startNewChat(); } toast.success("Chat history deleted"); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete chat."); } };
  const submitRecommendation = async (recommendation: Recommendation) => { try { const result = await createChange({ data: recommendation }); if (!result.ok) toast.error(result.error); else toast.success("Sent to Approval Center", { description: result.id }); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create change."); } };
  const departmentName = useMemo(() => departments.find((d) => d.department_key === departmentKey)?.display_name ?? "Workspace-wide", [departments, departmentKey]);
  const rotatingPlaceholders = useMemo(() => [
    "Investigate the Genesys license spike from this week",
    "What changed in Approval Center today?",
    "Explain how guardrails work",
    "Show me the most important operational risks right now",
    `Ask CenOps Copilot about ${departmentName.toLowerCase()}…`,
  ], [departmentName]);
  useEffect(() => {
    if (input || inputFocused || hasTyped || rotatingPlaceholders.length < 2) return;
    const timer = window.setInterval(() => setPlaceholderIndex((current) => (current + 1) % rotatingPlaceholders.length), 3200);
    return () => window.clearInterval(timer);
  }, [hasTyped, input, inputFocused, rotatingPlaceholders.length]);
  const filteredSessions = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    const candidates = sessions.filter((session) => session.title !== "New chat" || session.id === sessionId);
    if (!query) return candidates;
    return candidates.filter((s) => `${s.title} ${s.departmentName ?? "Workspace-wide"}`.toLowerCase().includes(query));
  }, [historyQuery, sessions, sessionId]);
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading chat…</div>;
  }

  const hasConversation = messages.length > 0;
  const activeSession = sessions.find((session) => session.id === sessionId);
  const conversationTitle = activeSession?.title ?? "New conversation";

  return (
    <div className="flex h-[calc(100vh-1.75rem)] min-h-0 w-full overflow-hidden bg-white text-foreground dark:bg-background">
      {historyOpen && (
        <aside className="hidden w-[300px] shrink-0 border-r bg-background lg:flex lg:flex-col">
          <div className="border-b p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search chats" className="h-9 rounded-lg pl-9 text-sm" />
            </div>
            <Button variant="secondary" className="mt-3 h-9 w-full justify-center font-medium" onClick={() => void startNewChat()}>
              <Plus className="mr-2 h-4 w-4" />New chat
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <div className="mb-3 flex items-center justify-between px-2 text-xs font-medium text-muted-foreground"><span>All</span><span>{filteredSessions.length}</span></div>
            <div className="space-y-1">
              {filteredSessions.map((session) => (
                <div key={session.id} className="group flex items-center gap-1 rounded-lg">
                  <button type="button" onClick={() => void openSession(session.id)}
                    className={"min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-muted/60 " + (session.id === sessionId ? "bg-primary/10 text-foreground" : "text-muted-foreground")}>
                    <div className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30" /><span className="truncate">{session.title || "Untitled chat"}</span></div>
                    {session.id === sessionId && <div className="mt-1 pl-4 text-[11px] text-muted-foreground">Now</div>}
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" onClick={() => void remove(session.id)} aria-label={"Delete " + (session.title || "chat")}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col bg-white dark:bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={() => setHistoryOpen((open) => !open)} title={historyOpen ? "Close chat history" : "Open chat history"} aria-label={historyOpen ? "Close chat history" : "Open chat history"}>
              {historyOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
            <div className="min-w-0 truncate text-sm font-medium text-foreground">{hasConversation ? conversationTitle : "New conversation"}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => void startNewChat()} title="New chat"><Plus className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="hidden h-8 w-8 rounded-full sm:inline-flex" onClick={() => void navigator.clipboard?.writeText(window.location.href)} title="Copy chat link"><Link2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="hidden h-8 w-8 rounded-full md:inline-flex" onClick={() => void document.documentElement.requestFullscreen?.()} title="Full screen"><Maximize2 className="h-4 w-4" /></Button>
            <FeatureHelpButton topicId="copilot" />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={"mx-auto flex w-full max-w-[1080px] flex-col px-5 sm:px-8 " + (hasConversation ? "pb-48 pt-8" : "min-h-full justify-center pb-10 pt-10")}>
            {!hasConversation && (
              <div className="mx-auto w-full max-w-[980px]">
                <div className="mb-7 text-center">
                  <h1 className="text-4xl font-semibold tracking-tight sm:text-[44px]">{firstName ? "Hi " + firstName + ", how can I help?" : "How can I help?"}</h1>
                  <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Ask CenOps about operations, integrations, AI agents, risks, or governed actions across your workspace.</p>
                </div>
              </div>
            )}

            {messages.map((message, index) => {
              const displayContent = cleanAssistantText(message.content);
              const actionableRecommendations = message.role === "assistant" && message.result?.actionRequired === true
                ? (message.result.recommendations ?? []).filter((recommendation) => recommendation.requiresApproval === true || ["change", "remediation", "provision", "deprovision", "configuration", "workflow"].some((kind) => String(recommendation.actionType ?? "").toLowerCase().includes(kind))).slice(0, 5)
                : [];
              const lower = displayContent.toLowerCase();
              const showIntegrationAction = message.role === "assistant" && (lower.includes("integration") || lower.includes("jira") || lower.includes("genesys") || lower.includes("aws"));
              const showAgentAction = message.role === "assistant" && lower.includes("agent");

              return (
                <article key={message.id ?? index + "-" + (message.createdAt ?? "message")} className={message.role === "user" ? "mb-7" : "mb-10"}>
                  {message.role === "user" ? (
                    <div className="w-full rounded-2xl border bg-background px-5 py-4 text-[15px] leading-7 shadow-sm">{displayContent}</div>
                  ) : message.result?.response ? (
                    <div className="w-full text-[15px] leading-7">
                      <CenOpsReasoningPanel response={message.result.response} intent={message.result.intent} scope={departmentName} />
                      <CenOpsResponseRenderer response={message.result.response} onFollowUp={send} />
                      {(() => {
                        const refs = featureReferencesFor(displayContent);
                        return refs.length ? (
                          <div className="mt-5 border-t pt-3">
                            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Related features</div>
                            <div className="flex flex-wrap gap-2">
                              {refs.map((ref) => <Link key={ref.to} to={ref.to} className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground">{ref.label}</Link>)}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ) : <CenOpsMarkdownMessage content={displayContent} className="w-full" />}

                  {message.role === "assistant" && (showIntegrationAction || showAgentAction) && !message.result?.response && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                      {showIntegrationAction && <Link to="/integrations" className="rounded-full border px-3 py-1.5 text-xs font-medium transition hover:border-primary/40 hover:bg-primary/5">Explore integrations</Link>}
                      {showAgentAction && <Link to="/agents" className="rounded-full border px-3 py-1.5 text-xs font-medium transition hover:border-primary/40 hover:bg-primary/5">Explore AI agents</Link>}
                    </div>
                  )}

                  {actionableRecommendations.map((recommendation, recommendationIndex) => (
                    <div key={String(recommendation.title ?? "recommendation") + "-" + recommendationIndex} className="mt-5 rounded-xl border bg-background p-4">
                      <div className="text-sm font-semibold">{recommendation.title ?? "Recommendation"}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{recommendation.rationale}</div>
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => void submitRecommendation(recommendation)}>Send to Approval Center</Button>
                    </div>
                  ))}

                  {message.result?.sources?.length ? <div className="mt-4 text-[10px] text-muted-foreground">Sources: {message.result.sources.join(" · ")}</div> : null}
                </article>
              );
            })}

            {mutation.isPending && <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" />Thinking</div>}
          </div>
        </div>

        <div className="shrink-0 bg-white px-5 pb-4 pt-2 dark:bg-background sm:px-8 sm:pb-5">
          <form onSubmit={(event) => { event.preventDefault(); send(input); }} className="mx-auto w-full max-w-[960px]">
            <div className="rounded-2xl border bg-background px-4 pb-3 pt-3 shadow-[0_8px_30px_rgba(0,0,0,0.06)] focus-within:border-primary/40">
              <Textarea value={input} onChange={(event) => { setInput(event.target.value); if (event.target.value) setHasTyped(true); }} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} onKeyDown={handleInputKeyDown}
                placeholder={hasConversation ? "Add a follow up" : rotatingPlaceholders[placeholderIndex] ?? rotatingPlaceholders[0]}
                className="min-h-[78px] resize-none border-0 px-1 py-1 text-[15px] shadow-none focus-visible:ring-0" disabled={mutation.isPending || !sessionId} />
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border bg-background transition hover:bg-muted" title="Add attachment"><Plus className="h-4 w-4" /></button>
                  <span className="font-medium">Plan</span>
                  <button type="button" role="switch" aria-checked={depth === "thorough"} onClick={() => setDepth((current) => current === "thorough" ? "quick" : "thorough")} className={"relative h-5 w-9 rounded-full border transition " + (depth === "thorough" ? "bg-primary" : "bg-muted")}>
                    <span className={"absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background shadow transition " + (depth === "thorough" ? "left-[18px]" : "left-0.5")} />
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <select aria-label="Response mode" value={depth} onChange={(event) => setDepth(event.target.value as "quick" | "thorough")} className="h-8 appearance-none bg-transparent px-1 text-xs font-medium outline-none">
                    <option value="thorough">Auto</option><option value="quick">Quick</option>
                  </select>
                  <Button type="submit" size="icon" className="h-10 w-10 rounded-full" disabled={!input.trim() || mutation.isPending || !sessionId} title={mutation.isPending ? "Thinking" : "Send"}>
                    {mutation.isPending ? <Square className="h-4 w-4 fill-current" /> : <ArrowUp className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between px-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Default approvals</span>
                {departments.length > 1 && <>
                  <span>·</span>
                  <select aria-label="Evidence scope" value={departmentKey ?? ""} onChange={(event) => void startNewChat(event.target.value)} className="max-w-[190px] truncate bg-transparent font-medium text-foreground/70 outline-none">
                    {departments.map((department) => <option key={department.department_key} value={department.department_key}>{department.display_name}</option>)}
                  </select>
                </>}
              </div>
              <span>AI can make mistakes</span>
            </div>

            {!hasConversation && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {suggestions.map(({ label, prompt, Icon }) => (
                  <button key={label} type="button" onClick={() => send(prompt)} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground">
                    <Icon className="h-3.5 w-3.5 text-primary" /><span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>
      </section>

      {mutation.isError && <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))]"><Alert variant="destructive"><AlertTitle>Enterprise AI unavailable</AlertTitle><AlertDescription>{mutation.error instanceof Error ? mutation.error.message : "Try again."}</AlertDescription></Alert></div>}
    </div>
  );
}
