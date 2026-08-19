// Server-only conversational layer for License Agent.
// The model never receives provider credentials and never calls Genesys directly.
// It receives only structured, read-only evidence returned by authorized capabilities.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authorizeCapabilityAccess } from "@/lib/capabilities/authorization.server";
import { capabilityRouter } from "@/lib/capabilities/router.server";
import { executeLicenseOptimization } from "./optimization";
import { executeLicenseAgent } from "./functions";
import { LICENSE_AGENT_KEY } from "./types";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "openrouter/free";

const OUT_OF_SCOPE_MESSAGE = "I don't have access to a connected data source that can answer that question. This License Agent can only answer questions using data from connected and authorized sources.";
const SOURCE_NOT_CONNECTED_MESSAGE = "I don't have access to the requested license data because a connected and authorized data source is not available. Please connect or enable the appropriate data source for this agent.";

export interface LicenseChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Intent {
  inScope: boolean;
  operation?: "summary" | "usage" | "assignments" | "user_details" | "optimization" | "source_access";
  userId?: string;
  userEmail?: string;
  licenseId?: string;
  licenseName?: string;
}

async function askModel(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  json = false,
): Promise<string> {
  const key = process.env["OPENROUTER_API_KEY"];
  if (!key) throw new Error("OpenRouter is not configured. Add OPENROUTER_API_KEY as a server-side secret.");
  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env["APP_URL"] ?? "http://localhost",
      "X-Title": "Aegis License Agent",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      temperature: 0.1,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned an empty response.");
  return content;
}

function parseIntent(raw: string): Intent {
  try {
    const parsed = JSON.parse(raw) as Partial<Intent>;
    const allowed: Intent["operation"][] = ["summary", "usage", "assignments", "user_details", "optimization", "source_access"];
    const operation = allowed.includes(parsed.operation as Intent["operation"])
      ? (parsed.operation as Intent["operation"])
      : undefined;
    return {
      inScope: parsed.inScope === true && Boolean(operation),
      operation,
      userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
      userEmail: typeof parsed.userEmail === "string" ? parsed.userEmail : undefined,
      licenseId: typeof parsed.licenseId === "string" ? parsed.licenseId : undefined,
      licenseName: typeof parsed.licenseName === "string" ? parsed.licenseName : undefined,
    };
  } catch {
    return { inScope: false };
  }
}

async function getRealLicenseSources(
  supabase: Parameters<typeof capabilityRouter.getUsers>[0],
  userId: string,
) {
  const decision = await authorizeCapabilityAccess(supabase, userId, LICENSE_AGENT_KEY, "license_inventory");
  if (!decision.ok) return [];
  return decision.sources.filter((source) => !source.isMock && source.implemented);
}

async function assertRealConnectedSource(
  supabase: Parameters<typeof capabilityRouter.getUsers>[0],
  userId: string,
): Promise<void> {
  if ((await getRealLicenseSources(supabase, userId)).length === 0) {
    throw new Error(SOURCE_NOT_CONNECTED_MESSAGE);
  }
}

async function collectEvidence(
  intent: Intent,
  supabase: Parameters<typeof capabilityRouter.getUsers>[0],
  userId: string,
) {
  if (!intent.operation) throw new Error(OUT_OF_SCOPE_MESSAGE);

  if (intent.operation === "source_access") {
    const sources = await getRealLicenseSources(supabase, userId);
    if (sources.length === 0) throw new Error(SOURCE_NOT_CONNECTED_MESSAGE);
    return {
      type: "source_access",
      sources: sources.map((source) => ({
        provider: source.provider,
        integrationId: source.integrationId,
        capabilities: source.capabilities,
        freshness: source.freshness,
      })),
    };
  }

  if (intent.operation === "summary") {
    const [licenses, users] = await Promise.all([
      capabilityRouter.getLicenseInventory(supabase, userId, LICENSE_AGENT_KEY),
      capabilityRouter.getUsers(supabase, userId, LICENSE_AGENT_KEY),
    ]);
    if (licenses.denied || users.denied || (licenses.records.length === 0 && users.records.length === 0)) {
      throw new Error(SOURCE_NOT_CONNECTED_MESSAGE);
    }
    return { type: "summary", licenses: licenses.records, users: users.records, freshness: licenses.freshness };
  }

  if (intent.operation === "usage") {
    return { type: "usage", result: await executeLicenseAgent({ data: { operation: "get_license_usage", filters: { licenseId: intent.licenseId, licenseName: intent.licenseName } } } as never) };
  }

  if (intent.operation === "assignments") {
    return { type: "assignments", result: await executeLicenseAgent({ data: { operation: "get_license_assignments", filters: { licenseId: intent.licenseId, licenseName: intent.licenseName, userId: intent.userId, userEmail: intent.userEmail } } } as never) };
  }

  if (intent.operation === "user_details") {
    return { type: "user_details", result: await executeLicenseAgent({ data: { operation: "get_user_license_details", filters: { userId: intent.userId, userEmail: intent.userEmail } } } as never) };
  }

  const [optimization, summary] = await Promise.all([
    executeLicenseOptimization({} as never),
    executeLicenseAgent({ data: { operation: "get_license_summary" } } as never),
  ]);
  return { type: "optimization", optimization, summary };
}

export const executeLicenseChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: LicenseChatMessage[] }) => ({
    messages: Array.isArray(input?.messages) ? input.messages.slice(-12) : [],
  }))
  .handler(async ({ data, context }) => {
    const latest = data.messages.at(-1)?.content?.trim();
    if (!latest) return { ok: false as const, error: "Please enter a question." };

    try {
      const intentRaw = await askModel([
        {
          role: "system",
          content:
            "You are the strict scope router for a License Agent. You are NOT a general assistant. A question is inScope only when it can be answered using connected License Agent data such as license assignments, license usage, users, user license details, connected source access, or evidence-backed license optimization. Questions about weather, news, coding, general knowledge, unrelated products, personal advice, or any other topic are out of scope. A question asking what data/sources the agent can access should use operation source_access. Return JSON only: {inScope:boolean, operation:'summary'|'usage'|'assignments'|'user_details'|'optimization'|'source_access'|null, userId?, userEmail?, licenseId?, licenseName?}. If out of scope, set inScope=false and operation=null. Never treat general knowledge as License Agent evidence.",
        },
        { role: "user", content: latest },
      ], true);
      const intent = parseIntent(intentRaw);

      if (!intent.inScope || !intent.operation) {
        return { ok: true as const, content: OUT_OF_SCOPE_MESSAGE, provider: "OpenRouter", model: OPENROUTER_MODEL, readOnly: true as const };
      }

      await assertRealConnectedSource(context.supabase, context.userId);
      const evidence = await collectEvidence(intent, context.supabase, context.userId);

      const response = await askModel([
        {
          role: "system",
          content:
            "You are the License Agent. You are NOT a general-purpose assistant. Answer ONLY from the supplied structured evidence from connected, authorized customer data. Never use pretrained/general knowledge as a substitute for missing customer data. Never invent facts, dates, usage, savings, license changes, customer configuration, or connected integrations. For a source_access question, explicitly state which connected provider/source and capabilities are available, and clarify that other sources are not available unless connected and authorized. If evidence cannot answer the question, say: 'I don't have access to sufficient connected data to answer that question.' If the requested data source/capability is not connected, say: 'I don't have access to that data source because it is not connected or authorized for this agent.' Distinguish a review opportunity from a recommendation to change a license. Never claim to have performed a license change. Be concise and business-friendly.",
        },
        { role: "user", content: JSON.stringify({ question: latest, conversation: data.messages.slice(-8), evidence }) },
      ]);

      return { ok: true as const, content: response, provider: "OpenRouter", model: OPENROUTER_MODEL, readOnly: true as const };
    } catch (error) {
      console.error("[license-agent-chat] failed", error);
      return { ok: false as const, error: error instanceof Error ? error.message : "The License Agent chat could not be completed." };
    }
  });
