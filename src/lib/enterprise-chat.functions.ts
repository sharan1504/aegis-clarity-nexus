import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getLiveWorkspaceData } from "@/lib/live-workspace.functions";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export interface EnterpriseChatMessage { role: "user" | "assistant"; content: string; }

async function askModel(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Lovable AI is not configured for this workspace.");
  const started = Date.now();
  const response = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, messages, temperature: 0.1, response_format: { type: "json_object" } }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`AI request failed (${response.status}).`);
  const body = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned an empty response.");
  return { content, usage: body.usage ?? {}, latencyMs: Date.now() - started };
}

export const executeEnterpriseChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: EnterpriseChatMessage[] }) => ({ messages: Array.isArray(input?.messages) ? input.messages.slice(-12) : [] }))
  .handler(async ({ data, context }) => {
    const latest = data.messages.at(-1)?.content?.trim();
    if (!latest) return { ok: false as const, error: "Please enter a message." };
    try {
      const live = await getLiveWorkspaceData();
      const prompt = `You are Aegis Enterprise AI, an enterprise operations analyst. You are not a generic chatbot. Use ONLY the live workspace evidence supplied below. Never invent metrics, incidents, users, savings, configuration or completed actions.

Return JSON with exactly: answer (string), analysis (string), recommendations (array of objects with title, rationale, impact, risk, nextStep), sources (array of strings), confidence (number 0-100), actionRequired (boolean).

The answer should be concise but useful. Analysis should explain how the evidence supports the conclusion. Recommendations must be conservative and evidence-backed. If a recommendation would change a connected system, clearly state that human approval is required. The current Genesys connector is READ-ONLY, so never claim that a Genesys change was or can be executed until a write-capable connector is explicitly available.

LIVE EVIDENCE:\n${JSON.stringify(live)}\n\nCONVERSATION:\n${JSON.stringify(data.messages.slice(-8))}`;
      const result = await askModel([{ role: "system", content: prompt }, { role: "user", content: latest }]);
      const parsed = JSON.parse(result.content) as { answer?: string; analysis?: string; recommendations?: unknown[]; sources?: string[]; confidence?: number; actionRequired?: boolean };
      const db = context.supabase as any;
      await db.from("ai_usage_events").insert({ tenant_id: (await context.supabase.from("profiles").select("tenant_id").eq("id", context.userId).single()).data?.tenant_id, user_id: context.userId, agent_key: "enterprise-assistant", provider: "Lovable AI", model: MODEL, input_tokens: Number(result.usage.prompt_tokens ?? 0), output_tokens: Number(result.usage.completion_tokens ?? 0), total_tokens: Number(result.usage.total_tokens ?? 0), latency_ms: result.latencyMs });
      return { ok: true as const, ...parsed, provider: "Lovable AI", model: MODEL, readOnly: true as const, fetchedAt: live.fetchedAt };
    } catch (error) {
      console.error("[enterprise-chat] failed", error);
      return { ok: false as const, error: error instanceof Error ? error.message : "Enterprise AI could not complete the analysis." };
    }
  });
