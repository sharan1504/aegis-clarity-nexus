import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createExternalTicketServer } from "@/lib/integrations/external-ticket.server";

export const createConfiguredApprovalTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { changeRecordId: string }) => ({ changeRecordId: String(input.changeRecordId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.changeRecordId) throw new Error("Change record ID is required.");
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("tenant_id,role")
      .eq("user_id", context.userId);
    if (roleError) throw roleError;
    const role = roles?.find((row) => row.role === "admin" || row.role === "manager");
    if (!role?.tenant_id) throw new Error("Admin/manager access is required to create an ITSM change ticket.");

    const { data: routing, error: routingError } = await (context.supabase as any)
      .from("itsm_routing_config")
      .select("provider,is_default")
      .eq("tenant_id", role.tenant_id)
      .eq("is_default", true)
      .maybeSingle();
    if (routingError) throw routingError;
    if (!routing) throw new Error("Configure ITSM routing before approving this change. The approval was not converted into an ITSM ticket.");

    const system = routing.provider === "jira" ? "Jira" : routing.provider === "servicenow" ? "ServiceNow" : null;
    if (!system) throw new Error(`The configured ITSM provider (${routing.provider}) is not yet enabled for Approval Center ticket creation.`);

    return createExternalTicketServer({
      data: {
        changeRecordId: data.changeRecordId,
        system,
      },
    });
  });
