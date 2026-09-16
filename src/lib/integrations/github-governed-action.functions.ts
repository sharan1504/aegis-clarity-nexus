import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor } from "@/lib/execution/gateway.server";
import { executeApprovedAction } from "./github-governed-action.server";

export const executeApprovedGitHubAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { changeRecordId: string }) => ({ changeRecordId: String(input.changeRecordId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.changeRecordId) return { ok: false as const, error: "A change record id is required." };
    const actor = await resolveActor(context.supabase, context.userId);
    return executeApprovedAction(context.supabase, actor, data.changeRecordId);
  });
