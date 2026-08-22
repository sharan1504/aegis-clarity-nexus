import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import type { EnterpriseChatMessage } from "@/lib/enterprise-chat.functions";

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredChatMessage = EnterpriseChatMessage & {
  id: string;
  createdAt: string;
  result?: Record<string, unknown> | null;
};

export const createChatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await resolveTenant(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("chat_sessions")
      .insert({ tenant_id: tenantId, user_id: context.userId, title: "New chat" })
      .select("id,title,created_at,updated_at")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Unable to create chat session.");
    return { session: { id: data.id, title: data.title, createdAt: data.created_at, updatedAt: data.updated_at } satisfies ChatSession };
  });

export const listChatSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenantId } = await resolveTenant(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("chat_sessions")
      .select("id,title,created_at,updated_at")
      .eq("tenant_id", tenantId)
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      sessions: (data ?? []).map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at } satisfies ChatSession)),
    };
  });

export const getChatSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string }) => ({ sessionId: String(input.sessionId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const { tenantId } = await resolveTenant(context.supabase, context.userId);
    const { data: session, error: sessionError } = await context.supabase
      .from("chat_sessions")
      .select("id,title,created_at,updated_at")
      .eq("id", data.sessionId)
      .eq("tenant_id", tenantId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session) throw new Error("Chat session not found.");

    const { data: messages, error: messageError } = await context.supabase
      .from("chat_messages")
      .select("id,role,content,result,created_at")
      .eq("session_id", session.id)
      .eq("tenant_id", tenantId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (messageError) throw new Error(messageError.message);

    return {
      session: { id: session.id, title: session.title, createdAt: session.created_at, updatedAt: session.updated_at } satisfies ChatSession,
      messages: (messages ?? []).map((row) => ({ id: row.id, role: row.role as EnterpriseChatMessage["role"], content: row.content, result: (row.result ?? undefined) as Record<string, unknown> | undefined, createdAt: row.created_at } satisfies StoredChatMessage)),
    };
  });

export const deleteChatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string }) => ({ sessionId: String(input.sessionId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const { tenantId } = await resolveTenant(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("chat_sessions")
      .delete()
      .eq("id", data.sessionId)
      .eq("tenant_id", tenantId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
