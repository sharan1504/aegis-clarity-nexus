import { resolveActor, userClientFromToken, type ActorContext, type UserClient } from "@/lib/execution/gateway.server";

export type GovernedMcpContext = {
  isAuthenticated: () => boolean;
  token?: string;
  userId?: string;
};

export async function getMcpTenantContext(raw: unknown): Promise<{ supabase: UserClient; actor: ActorContext }> {
  const ctx = raw as GovernedMcpContext;
  if (!ctx.isAuthenticated() || !ctx.token || !ctx.userId) throw new Error("Not authenticated");
  const supabase = userClientFromToken(ctx.token);
  const actor = await resolveActor(supabase, ctx.userId);
  return { supabase, actor };
}

export function normalizeSeverity(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}
