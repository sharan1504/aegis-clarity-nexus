// Server-only conversational layer for License Agent.
// The model never receives provider credentials and never calls Genesys directly.
// It receives only structured, read-only evidence returned by authorized capabilities.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { capabilityRouter } from "@/lib/capabilities/router.server";
import { executeLicenseOptimization } from "./optimization";
import { executeLicenseAgent } from "./functions";
import { LICENSE_AGENT_KEY } from "./types";

const LOVABLE_AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_AI_MODEL = "google/gemini-3-flash-preview";

export interface LicenseChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Intent {
  operation: "summary" | "usage" | "assignments" | "user_details" | "optimization";
  userId?: string;
  userEmail?: string;
  licenseId?: string;
  licenseName?: string;
}

async function askModel(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, json = false): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Lovable AI is not configured for this environment.");
  const response = await fetch(LOVABLE_AI_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: LOVABLE_AI_MODEL, messages, temperature: 0.1, ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lovable AI request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Lovable AI returned an empty response.");
  return content;
}

function parseIntent(raw: string): Intent {
  try {
    const parsed = JSON.parse(raw) as Partial<Intent>;
    const allowed: Intent["operation"][] = ["summary", "usage", "assignments", "user_details", "optimization"];
    if (!allowed.includes(parsed.operation as Intent["operation"])) return { operation: "optimization" };
    return { operation: parsed.operation as Intent["operation"], userId: typeof parsed.userId === "string" ? parsed.userId : undefined, userEmail: typeof parsed.userEmail === "string" ? parsed.userEmail : undefined, licenseId: typeof parsed.licenseId === "string" ? parsed.licenseId : undefined, licenseName: typeof parsed.licenseName === "string" ? parsed.licenseName : undefined };
  } catch {
    return { operation: "optimization" };
  }
}

async function collectEvidence(intent: Intent, supabase: Parameters<typeof capabilityRouter.getUsers>[0], userId: string) {
  if (intent.operation === "summary") {
    const [licenses, users] = await Promise.all([capabilityRouter.getLicenseInventory(supabase, userId, LICENSE_AGENT_KEY), capabilityRouter.getUsers(supabase, userId, LICENSE_AGENT_KEY)]);
    if (licenses.denied || users.denied) throw new Error("The requested capability is not authorized.");
    return { type: "summary", licenses: licenses.records, users: users.records, freshness: licenses.freshness };
  }
  if (intent.operation === "usage") return { type: "usage", result: await executeLicenseAgent({ data: { operation: "get_license_usage", filters: { licenseId: intent.licenseId, licenseName: intent.licenseName } } } as never) };
  if (intent.operation === "assignments") return { type: "assignments", result: await executeLicenseAgent({ data: { operation: "get_license_assignments", filters: { licenseId: intent.licenseId, licenseName: intent.licenseName, userId: intent.userId, userEmail: intent.userEmail } } } as never) };
  if (intent.operation === "user_details") return { type: "user_details", result: await executeLicenseAgent({ data: { operation: "get_user_license_details", filters: { userId: intent.userId, userEmail: intent.userEmail } } } as never) };
  const [optimization, summary] = await Promise.all([executeLicenseOptimization({} as never), executeLicenseAgent({ data: { operation: "get_license_summary" } } as never)]);
  return { type: "optimization", optimization, summary };
}

export const executeLicenseChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: LicenseChatMessage[] }) => ({ messages: Array.isArray(input?.messages) ? input.messages.slice(-12) : [] }))
  .handler(async ({ data, context }) => {
    const latest = data.messages.at(-1)?.content?.trim();
    if (!latest) return { ok: false as const, error: "Please enter a question." };
    try {
      const intentRaw = await askModel([
        { role: "system", content: "You route License Agent questions to read-only evidence capabilities. Return JSON only with operation equal to one of summary, usage, assignments, user_details, optimization. Include filters only when explicitly present. Never invent IDs or emails. Use optimization for broad recommendation/optimization questions. Use user_details for a named user, assignments for assignment lists, usage for utilization questions, summary for high-level inventory questions." },
        { role: "user", content: latest },
      ], true);
      const intent = parseIntent(intentRaw);
      const evidence = await collectEvidence(intent, context.supabase, context.userId);
      const response = await askModel([
        { role: "system", content: "You are the License Agent. Answer only from the supplied structured evidence. Do not invent facts, dates, usage, savings, license changes, or customer configuration. If the evidence cannot answer the question, say: 'There is not sufficient information available in the connected data to make a reliable recommendation for this request.' Distinguish a review opportunity from a recommendation to change a license. Never claim to have performed a license change. Be concise and business-friendly. Mention relevant evidence and limitations." },
        { role: "user", content: JSON.stringify({ question: latest, conversation: data.messages.slice(-8), evidence }) },
      ]);
      return { ok: true as const, content: response, provider: "Lovable AI", model: LOVABLE_AI_MODEL, readOnly: true as const };
    } catch (error) {
      console.error("[license-agent-chat] failed", error);
      return { ok: false as const, error: error instanceof Error ? error.message : "The License Agent chat could not be completed." };
    }
  });
