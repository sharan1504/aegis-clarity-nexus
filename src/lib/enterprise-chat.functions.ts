import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadLiveWorkspaceData } from "@/lib/live-workspace.functions";
import { deriveCorrelatedSignals, loadProviderReportData } from "@/lib/provider-sync.functions";
import { resolveTenant } from "@/lib/genesys/store.server";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export interface EnterpriseChatMessage {
  role: "user" | "assistant";
  content: string;
}

type ChatResult = {
  answer?: string;
  analysis?: string;
  recommendations?: unknown[];
  sources?: string[];
  correlatedSignals?: unknown[];
  confidence?: number;
  actionRequired?: boolean;
};

async function askModel(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Lovable AI is not configured for this workspace.");

  const started = Date.now();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.1, response_format: { type: "json_object" } }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`AI request failed (${response.status}).`);

  const body = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned an empty response.");
  return { content, usage: body.usage ?? {}, latencyMs: Date.now() - started };
}

export const executeEnterpriseChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string; messages: EnterpriseChatMessage[] }) => ({
    sessionId: String(input?.sessionId ?? "").trim(),
    messages: Array.isArray(input?.messages) ? input.messages : [],
  }))
  .handler(async ({ data, context }) => {
    const latest = data.messages.at(-1)?.content?.trim();
    if (!data.sessionId) return { ok: false as const, error: "A chat session is required." };
    if (!latest) return { ok: false as const, error: "Please enter a message." };

    try {
      const { tenantId } = await resolveTenant(context.supabase, context.userId);
      const db = context.supabase as any;

      const { data: session, error: sessionError } = await db
        .from("chat_sessions")
        .select("id,title")
        .eq("id", data.sessionId)
        .eq("tenant_id", tenantId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (sessionError || !session) throw new Error("Chat session not found.");

      const { error: userMessageError } = await db.from("chat_messages").insert({
        tenant_id: tenantId,
        session_id: data.sessionId,
        user_id: context.userId,
        role: "user",
        content: latest,
      });
      if (userMessageError) throw new Error(userMessageError.message);

      const { data: storedMessages, error: historyError } = await db
        .from("chat_messages")
        .select("role,content")
        .eq("session_id", data.sessionId)
        .eq("tenant_id", tenantId)
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (historyError) throw new Error(historyError.message);

      const conversation = (storedMessages ?? []).reverse() as EnterpriseChatMessage[];
      const [live, providers] = await Promise.all([
        loadLiveWorkspaceData(context.supabase, context.userId),
        loadProviderReportData(context.supabase, context.userId),
      ]);
      const correlations = deriveCorrelatedSignals(providers.entities);
      const prompt = `You are Aegis Enterprise AI, an enterprise operations analyst. Use ONLY the live workspace evidence supplied below. Never invent metrics, incidents, users, savings, configuration, correlations or completed actions. A cross-provider correlation is valid only when the supplied evidence contains a shared timeframe or explicit reference. Temporal alignment is not causation; describe it as alignment only.\n\nReturn JSON with exactly: answer (string), analysis (string), recommendations (array of objects with title, rationale, impact, risk, nextStep), sources (array of strings), correlatedSignals (array of objects with title, detail, providers, timestamp), confidence (number 0-100), actionRequired (boolean). If no real correlation exists, return an empty correlatedSignals array. Recommendations must be conservative and evidence-backed. If a recommendation would change a connected system, clearly state that human approval is required.\n\nGENESYS LIVE EVIDENCE:\n${JSON.stringify(live)}\n\nOTHER CONNECTED PROVIDER EVIDENCE:\n${JSON.stringify(providers)}\n\nPRECOMPUTED EVIDENCE-BACKED CORRELATIONS:\n${JSON.stringify(correlations)}\n\nCONVERSATION:\n${JSON.stringify(conversation.slice(-8))}`;

      const result = await askModel([{ role: "system", content: prompt }, { role: "user", content: latest }]);
      const parsed = JSON.parse(result.content) as ChatResult;

      const safeCorrelations = Array.isArray(parsed.correlatedSignals)
        ? parsed.correlatedSignals
            .filter((candidate: any) => correlations.some((real) => real.title === candidate?.title && real.detail === candidate?.detail))
            .slice(0, 10)
        : [];
      const safeResult = { ...parsed, correlatedSignals: safeCorrelations };

      const { error: assistantMessageError } = await db.from("chat_messages").insert({
        tenant_id: tenantId,
        session_id: data.sessionId,
        user_id: context.userId,
        role: "assistant",
        content: parsed.answer ?? "Analysis complete.",
        result: safeResult,
      });
      if (assistantMessageError) throw new Error(assistantMessageError.message);

      const title = session.title === "New chat" ? latest.slice(0, 80) : session.title;
      await db
        .from("chat_sessions")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", data.sessionId)
        .eq("tenant_id", tenantId)
        .eq("user_id", context.userId);

      await db.from("ai_usage_events").insert({
        tenant_id: tenantId,
        user_id: context.userId,
        agent_key: "enterprise-assistant",
        provider: "Lovable AI",
        model: MODEL,
        input_tokens: Number(result.usage.prompt_tokens ?? 0),
        output_tokens: Number(result.usage.completion_tokens ?? 0),
        total_tokens: Number(result.usage.total_tokens ?? 0),
        latency_ms: result.latencyMs,
      });

      return {
        ok: true as const,
        ...safeResult,
        provider: "Lovable AI",
        model: MODEL,
        readOnly: true as const,
        fetchedAt: live.fetchedAt,
      };
    } catch (error) {
      console.error("[enterprise-chat] failed", error);
      return { ok: false as const, error: error instanceof Error ? error.message : "Enterprise AI could not complete the analysis." };
    }
  });
