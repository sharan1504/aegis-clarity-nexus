import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadCommandCenterData } from "@/lib/command-center.server";

export type { CommandCenterData, CommandCenterChange, CommandCenterSignal } from "@/lib/command-center.server";

export const getCommandCenterData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadCommandCenterData(context.supabase, context.userId));
