import { useState } from "react";
import { Loader2, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { executeLicenseChat, type LicenseChatMessage } from "@/lib/agents/license/chat";

export function LicenseAgentChat() {
  const chat = useServerFn(executeLicenseChat);
  const [messages, setMessages] = useState<LicenseChatMessage[]>([]);
  const [input, setInput] = useState("");

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      const next = [...messages, { role: "user" as const, content }];
      const result = await chat({ data: { messages: next } });
      return { result, next };
    },
    onSuccess: ({ result, next }) => {
      if (!result.ok) return;
      setMessages([...next, { role: "assistant", content: result.content }]);
      setInput("");
    },
  });

  const submit = () => {
    const content = input.trim();
    if (!content || mutation.isPending) return;
    mutation.mutate(content);
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4" />
          License Agent Chat
          <Badge variant="outline" className="text-[10px]">read only</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ask questions about your connected license data. Answers are grounded in authorized evidence; missing information is reported instead of guessed.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length === 0 && (
          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            Try: “What license optimization opportunities do we have?” or “Which users have multiple licenses?”
          </div>
        )}
        <div className="max-h-[420px] space-y-3 overflow-y-auto">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`rounded-md p-3 text-sm ${message.role === "user" ? "ml-8 bg-muted" : "mr-8 border"}`}>
              <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">{message.role === "user" ? "You" : "License Agent"}</div>
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))}
          {mutation.isPending && (
            <div className="mr-8 flex items-center gap-2 rounded-md border p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing authorized license evidence…
            </div>
          )}
        </div>
        {mutation.isError && <Alert variant="destructive"><AlertTitle>Chat unavailable</AlertTitle><AlertDescription>Please try again.</AlertDescription></Alert>}
        <div className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Ask the License Agent…" disabled={mutation.isPending} />
          <Button onClick={submit} disabled={!input.trim() || mutation.isPending} size="icon" aria-label="Send">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><ShieldCheck className="h-3 w-3" /> No license changes can be performed through this chat.</div>
      </CardContent>
    </Card>
  );
}
