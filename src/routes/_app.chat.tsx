import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { ArrowUp, Bot, Sparkles, User as UserIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { chatSuggestions } from "@/lib/mock-data";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/chat")({
  head: () => pageHead({ path: "/chat", title: "Ask Aegis — Operations AI Chat", description: "Ask questions about incidents, spend, licences, and security posture and get grounded answers from your connected enterprise systems." }),
  component: ChatPage,
});

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const CANNED: Record<string, string> = {
  license:
    "I found **142 unused Microsoft 365 E5 licenses** (last login > 90 days). Reclaiming them saves ~$54,600/year. Want me to draft a phased reclamation plan?",
  aws: "AWS costs increased **12.3% ($18.4K)** this week. Top drivers: 1) EC2 m5.4xlarge fleet in us-east-1 (+$9.2K), 2) NAT Gateway egress from data pipeline (+$4.1K), 3) S3 Intelligent-Tiering transitions (+$2.6K). Two of these have safe rightsizing recommendations.",
  sla: "In the last 24h I count **3 SLA breaches**: INC-4821 (Genesys voice, 12m open, P1), INC-4820 (Azure AD, 38m open, P2), and INC-4812 (AWS S3 policy drift, 6h open, P2).",
  incident:
    "INC-4821 — voice latency in EU-West. Correlated signals: SIP trunk RTT +180ms, Azure ExpressRoute path change 08:14 UTC, no code deploy in last 4h. Likely cause: **network path change on ExpressRoute**. Suggested action: fail over EU-West voice to secondary trunk.",
  jira:
    "Draft ticket ready: **[OPS-2185] Azure AD sign-in failures for finance group** — priority High, component IAM, assigned to M. Alvarez, linked to INC-4820. Approve to create.",
  savings:
    "For production I see **$220K/yr** in savings across 3 categories: rightsizing (38 EC2, 12 Azure VMs), reserved capacity (72% coverage → 88%), and idle resources (14 orphaned volumes, 6 unused load balancers).",
};

function pickReply(q: string) {
  const s = q.toLowerCase();
  if (s.includes("license")) return CANNED.license;
  if (s.includes("aws") && s.includes("cost")) return CANNED.aws;
  if (s.includes("sla")) return CANNED.sla;
  if (s.includes("investigate") || s.includes("incident")) return CANNED.incident;
  if (s.includes("jira") || s.includes("ticket")) return CANNED.jira;
  if (s.includes("saving") || s.includes("recommend")) return CANNED.savings;
  return "I can help with that. In this MVP I'm running on mocked data — once you connect the real integrations, I'll pull live signals from Genesys, AWS, Azure, M365, Jira, ServiceNow, Salesforce, Slack, and GitHub.";
}

function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi Amelia — I'm **Aegis**, your enterprise AI operator. Ask me anything about your licenses, cloud spend, incidents, security posture, or contact center. I can also draft tickets and workflows for approval.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setPending(true);
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", content: pickReply(q) }]);
      setPending(false);
    }, 650);
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader
        title="AI Chat Assistant"
        description="Natural-language operations across every connected system."
      />

      <Card className="flex flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-6">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div
                className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-foreground"
                }`}
              >
                {m.content.split(/\*\*(.+?)\*\*/g).map((part, idx) =>
                  idx % 2 === 1 ? <strong key={idx}>{part}</strong> : <span key={idx}>{part}</span>,
                )}
              </div>

              {m.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <UserIcon className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {pending && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="rounded-2xl bg-muted/50 px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            </div>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="border-t border-border p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" /> Try asking
            </div>
            <div className="flex flex-wrap gap-2">
              {chatSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <CardContent className="border-t border-border p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about licenses, costs, incidents, tickets…"
              className="min-h-[48px] resize-none"
              rows={1}
            />
            <Button type="submit" size="icon" aria-label="Send message" disabled={!input.trim() || pending}>
              <ArrowUp className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
