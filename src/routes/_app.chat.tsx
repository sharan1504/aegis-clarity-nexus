import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { ArrowUp, Bot, ShieldCheck, Sparkles, User as UserIcon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { executeLicenseChat, type LicenseChatMessage } from "@/lib/agents/license/chat";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/chat")({
  head: () => pageHead({
    path: "/chat",
    title: "Ask Aegis — License Agent Chat",
    description: "Ask grounded questions about connected license data and receive evidence-based answers.",
  }),
  component: ChatPage,
});

function ChatPage() {
  const chat = useServerFn(executeLicenseChat);
  const [messages, setMessages] = useState<LicenseChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi — I'm Aegis License Agent. I can answer questions using connected and authorized license data. If the required data source isn't connected or the question is outside my available data, I'll tell you rather than guess.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const mutation = useMutation({
    mutationFn: async ({ next }: { content: string; next: LicenseChatMessage[] }) => {
      return chat({ data: { messages: next } });
    },
    onSuccess: (result) => {
      if (!result.ok) return;
      setMessages((current) => [...current, { role: "assistant", content: result.content }]);
    },
  });

  const send = (text: string) => {
    const content = text.trim();
    if (!content || mutation.isPending) return;

    // Post the customer's message immediately. The UI must not wait for the
    // LLM/data call to finish before showing what the customer asked.
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    mutation.mutate({ content, next });
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader
        title="AI Chat Assistant"
        description="Ask questions about connected license data. Answers are grounded in authorized evidence."
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
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-foreground"
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

          {mutation.isPending && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="rounded-2xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
                Analyzing connected license evidence…
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
              {[
                "What license optimization opportunities do we have?",
                "Which users have multiple licenses?",
                "What license data can you access?",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => send(suggestion)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {mutation.isError && (
          <div className="border-t border-border p-3">
            <Alert variant="destructive">
              <AlertTitle>Chat unavailable</AlertTitle>
              <AlertDescription>Unable to contact the License Agent. Your question has been posted above. Check the server configuration and try again.</AlertDescription>
            </Alert>
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
              placeholder="Ask the License Agent…"
              className="min-h-[48px] resize-none"
              rows={1}
              disabled={mutation.isPending}
            />
            <Button type="submit" size="icon" aria-label="Send message" disabled={!input.trim() || mutation.isPending}>
              <ArrowUp className="h-4 w-4" />
            </Button>
          </form>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            <Badge variant="outline" className="text-[9px]">read only</Badge>
            No mock data or license changes are allowed through this chat.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
