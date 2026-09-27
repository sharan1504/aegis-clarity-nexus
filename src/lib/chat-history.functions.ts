import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { resolveDepartmentContext } from "@/lib/department-access.server";
import { DEMO_CHAT_SESSIONS } from "@/lib/demo-data";
import type { EnterpriseChatMessage } from "@/lib/enterprise-chat.functions";
import { resolveTenantContext } from "@/lib/tenant-context.server";

export type ChatSession = { id: string; title: string; createdAt: string; updatedAt: string; departmentKey: string | null; departmentName: string | null };
export type StoredChatMessage = EnterpriseChatMessage & { id: string; createdAt: string; result?: Record<string, unknown> | null };

function departmentName(key: string | null) {
  return key === "contact-center" ? "Contact Center" : key === "cloud-platform" ? "Cloud Platform" : key === "security" ? "Security" : "All departments";
}

async function isDemoTenant(context: any) {
  return (await resolveTenantContext(context.supabase, context.userId)).environmentMode === "demo";
}

async function demoDb(context: any) {
  const tenant = await resolveTenantContext(context.supabase, context.userId);
  return { db: context.supabase as any, tenantId: tenant.tenantId };
}

async function ensureDemoSeeded(context: any, tenantId: string, db: any) {
  const seedVersion = "v2";
  const { data: seed } = await db.from("demo_chat_seed_state")
    .select("seed_version")
    .eq("tenant_id", tenantId)
    .eq("user_id", context.userId)
    .eq("seed_version", seedVersion)
    .maybeSingle();
  if (seed) return;

  for (const row of DEMO_CHAT_SESSIONS) {
    const { data: existing } = await db.from("chat_sessions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", context.userId)
      .eq("demo_seed_key", row.id)
      .maybeSingle();

    if (existing?.id) continue;

    const { data: session, error: sessionError } = await db.from("chat_sessions")
      .insert({
        tenant_id: tenantId,
        user_id: context.userId,
        title: row.title,
        department_key: "contact-center",
        demo_seed_key: row.id,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      if (/duplicate key|unique constraint/i.test(sessionError?.message ?? "")) continue;
      throw new Error(sessionError?.message ?? "Unable to seed demo chat history.");
    }

    const messages = row.messages.map((message, index) => ({
      tenant_id: tenantId,
      session_id: session.id,
      user_id: context.userId,
      role: message.role,
      content: message.content,
      created_at: new Date(row.updatedAt).getTime() + index,
    }));

    const { error: messageError } = await db.from("chat_messages").insert(messages);
    if (messageError) throw new Error(messageError.message);
  }

  const { error: stateError } = await db.from("demo_chat_seed_state").upsert(
    { tenant_id: tenantId, user_id: context.userId, seed_version: seedVersion },
    { onConflict: "tenant_id,user_id,seed_version", ignoreDuplicates: true },
  );
  if (stateError) throw new Error(stateError.message);
}

function mapSession(row: any): ChatSession {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    departmentKey: row.department_key ?? null,
    departmentName: departmentName(row.department_key ?? null),
  };
}

async function getDemoSessions(context: any, tenantId: string, db: any) {
  await ensureDemoSeeded(context, tenantId, db);
  const { data, error } = await db.from("chat_sessions")
    .select("id,title,created_at,updated_at,department_key")
    .eq("tenant_id", tenantId)
    .eq("user_id", context.userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapSession);
}

async function getDemoSession(context: any, tenantId: string, db: any, sessionId: string) {
  await ensureDemoSeeded(context, tenantId, db);
  const { data: session, error: sessionError } = await db.from("chat_sessions")
    .select("id,title,created_at,updated_at,department_key")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error("Chat session not found.");

  const { data: messages, error: messageError } = await db.from("chat_messages")
    .select("id,role,content,result,created_at")
    .eq("session_id", session.id)
    .eq("tenant_id", tenantId)
    .eq("user_id", context.userId)
    .order("created_at", { ascending: true });
  if (messageError) throw new Error(messageError.message);

  return {
    session: mapSession(session),
    messages: (messages ?? []).map((row: any) => ({
      id: row.id,
      role: row.role as EnterpriseChatMessage["role"],
      content: row.content,
      result: (row.result ?? undefined) as Record<string, unknown> | undefined,
      createdAt: row.created_at,
    } satisfies StoredChatMessage)),
  };
}

export const createChatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { departmentKey?: string | null }) => ({
    departmentKey: input?.departmentKey ? String(input.departmentKey).trim().toLowerCase() : null,
  }))
  .handler(async ({ data, context }) => {
    const { db, tenantId } = await demoDb(context);
    if (await isDemoTenant(context)) {
      const now = new Date().toISOString();
      const { data: row, error } = await db.from("chat_sessions")
        .insert({ tenant_id: tenantId, user_id: context.userId, title: "New chat", department_key: data.departmentKey ?? "all" })
        .select("id,title,created_at,updated_at,department_key")
        .single();
      if (error || !row) throw new Error(error?.message ?? "Unable to create chat session.");
      return { session: mapSession(row) };
    }

    const department = await resolveDepartmentContext(context.supabase, context.userId, data.departmentKey);
    const { data: row, error } = await db.from("chat_sessions")
      .insert({ tenant_id: tenantId, user_id: context.userId, title: "New chat", department_key: department.departmentKey })
      .select("id,title,created_at,updated_at,department_key")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Unable to create chat session.");
    return { session: { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, departmentKey: row.department_key ?? null, departmentName: department.departmentName } satisfies ChatSession };
  });

export const updateChatSessionTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string; title: string }) => ({
    sessionId: String(input.sessionId ?? "").trim(),
    title: String(input.title ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data, context }) => {
    if (!data.sessionId || !data.title) throw new Error("A chat session title is required.");
    const { db, tenantId } = await demoDb(context);

    if (await isDemoTenant(context)) {
      const { data: row, error } = await db.from("chat_sessions")
        .update({ title: data.title, updated_at: new Date().toISOString() })
        .eq("id", data.sessionId).eq("tenant_id", tenantId).eq("user_id", context.userId)
        .select("id,title,created_at,updated_at,department_key").maybeSingle();
      if (error || !row) throw new Error(error?.message ?? "Chat session not found.");
      return { ok: true as const, session: mapSession(row) };
    }

    const department = await resolveDepartmentContext(context.supabase, context.userId);
    const { data: row, error } = await db.from("chat_sessions")
      .update({ title: data.title, updated_at: new Date().toISOString() })
      .eq("id", data.sessionId).eq("tenant_id", tenantId).eq("user_id", context.userId)
      .select("id,title,created_at,updated_at,department_key").maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Chat session not found.");
    return { ok: true as const, session: { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, departmentKey: row.department_key ?? null, departmentName: department.departmentName } satisfies ChatSession };
  });

export const getMyDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (await isDemoTenant(context)) {
      return {
        departments: [
          { department_key: "contact-center", display_name: "Contact Center" },
          { department_key: "cloud-platform", display_name: "Cloud Platform" },
          { department_key: "security", display_name: "Security" },
        ],
        selected: "contact-center",
        unrestricted: true,
      };
    }
    const department = await resolveDepartmentContext(context.supabase, context.userId);
    return { departments: department.departments, selected: department.departmentKey, unrestricted: department.unrestricted };
  });

export const listChatSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, tenantId } = await demoDb(context);
    if (await isDemoTenant(context)) return { sessions: await getDemoSessions(context, tenantId, db) };

    const { data, error } = await db.from("chat_sessions").select("id,title,created_at,updated_at,department_key")
      .eq("tenant_id", tenantId).eq("user_id", context.userId).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const departmentKeys = [...new Set((data ?? []).map((row: any) => row.department_key).filter(Boolean))];
    const { data: departments } = departmentKeys.length
      ? await db.from("departments").select("department_key,display_name").in("department_key", departmentKeys)
      : { data: [] };
    const names = new Map((departments ?? []).map((row: any) => [row.department_key, row.display_name]));
    return { sessions: (data ?? []).map((row: any) => ({ ...mapSession(row), departmentName: row.department_key ? names.get(row.department_key) ?? row.department_key : null })) };
  });

export const getChatSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string }) => ({ sessionId: String(input.sessionId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const { db, tenantId } = await demoDb(context);
    if (await isDemoTenant(context)) return getDemoSession(context, tenantId, db, data.sessionId);

    const { data: session, error: sessionError } = await db.from("chat_sessions")
      .select("id,title,created_at,updated_at,department_key")
      .eq("id", data.sessionId).eq("tenant_id", tenantId).eq("user_id", context.userId).maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session) throw new Error("Chat session not found.");
    const department = await resolveDepartmentContext(context.supabase, context.userId, session.department_key);
    const { data: messages, error: messageError } = await db.from("chat_messages").select("id,role,content,result,created_at")
      .eq("session_id", session.id).eq("tenant_id", tenantId).eq("user_id", context.userId).order("created_at", { ascending: true });
    if (messageError) throw new Error(messageError.message);
    return {
      session: { id: session.id, title: session.title, createdAt: session.created_at, updatedAt: session.updated_at, departmentKey: department.departmentKey, departmentName: department.departmentName } satisfies ChatSession,
      messages: (messages ?? []).map((row: any) => ({ id: row.id, role: row.role as EnterpriseChatMessage["role"], content: row.content, result: (row.result ?? undefined) as Record<string, unknown> | undefined, createdAt: row.created_at } satisfies StoredChatMessage)),
    };
  });

export const deleteChatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string }) => ({ sessionId: String(input.sessionId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const { db, tenantId } = await demoDb(context);
    const { error } = await db.from("chat_sessions").delete()
      .eq("id", data.sessionId).eq("tenant_id", tenantId).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
