import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type UserClient = SupabaseClient<Database>;
type DepartmentRow = { id: string; department_key: string; display_name: string; description: string | null };

type DepartmentContext = {
  tenantId: string;
  roles: string[];
  departments: DepartmentRow[];
  departmentKey: string | null;
  departmentName: string | null;
  unrestricted: boolean;
};

const dbOf = (supabase: UserClient) => supabase as unknown as {
  from: (table: string) => any;
};

/**
 * Resolves the department boundary from the authenticated session. The caller
 * may request a department only when it is already assigned to that user.
 * Tenant admins/managers with no department assignment retain workspace-wide
 * access for administration/backward compatibility; once a department is
 * assigned, their AI/data access is scoped to that department.
 */
export async function resolveDepartmentContext(
  supabase: UserClient,
  userId: string,
  requestedDepartmentKey?: string | null,
): Promise<DepartmentContext> {
  const db = dbOf(supabase);
  const { data: profile } = await db.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
  const tenantId = profile?.tenant_id as string | undefined;
  if (!tenantId) throw new Error("Your account is not attached to a workspace yet.");

  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", userId).eq("tenant_id", tenantId);
  const roles = (roleRows ?? []).map((row: { role: string }) => String(row.role));
  if (!roles.length) throw new Error("Your account has no role in this workspace.");

  const { data: memberships, error: membershipError } = await db
    .from("user_department_memberships")
    .select("department_id, departments(id,department_key,display_name,description)")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);
  if (membershipError) throw new Error(membershipError.message);

  const departments = (memberships ?? [])
    .map((row: { departments?: DepartmentRow | DepartmentRow[] | null }) => Array.isArray(row.departments) ? row.departments[0] : row.departments)
    .filter((row: DepartmentRow | undefined): row is DepartmentRow => Boolean(row));

  const isPrivileged = roles.some((role) => role === "admin" || role === "manager");
  if (!departments.length) {
    if (!isPrivileged) throw new Error("A department must be assigned before this account can access departmental AI data.");
    return { tenantId, roles, departments: [], departmentKey: null, departmentName: null, unrestricted: true };
  }

  const selectedKey = requestedDepartmentKey?.trim().toLowerCase() || departments[0].department_key;
  const selected = departments.find((department) => department.department_key === selectedKey);
  if (!selected) throw new Error("You are not authorized for that department.");

  return {
    tenantId,
    roles,
    departments,
    departmentKey: selected.department_key,
    departmentName: selected.display_name,
    unrestricted: false,
  };
}

/** Returns only agents explicitly allowed for the resolved department. */
export async function getDepartmentAgentKeys(
  supabase: UserClient,
  context: DepartmentContext,
): Promise<string[] | null> {
  if (context.unrestricted) return null;
  const db = dbOf(supabase);
  const department = context.departments.find((item) => item.department_key === context.departmentKey);
  if (!department) return [];

  const { data, error } = await db
    .from("department_agent_access")
    .select("agent_key")
    .eq("tenant_id", context.tenantId)
    .eq("department_id", department.id)
    .eq("enabled", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { agent_key: string }) => row.agent_key);
}

/**
 * Determines which provider integrations can contribute evidence to a
 * department-scoped AI request. It intentionally uses agent bindings rather
 * than trusting provider names supplied by the browser.
 */
export async function getDepartmentProviders(
  supabase: UserClient,
  context: DepartmentContext,
): Promise<string[] | null> {
  const agentKeys = await getDepartmentAgentKeys(supabase, context);
  if (agentKeys === null) return null;
  if (!agentKeys.length) return [];
  const db = dbOf(supabase);
  const { data, error } = await db
    .from("agent_integration_bindings")
    .select("integration_id, integrations(provider)")
    .eq("tenant_id", context.tenantId)
    .in("agent_key", agentKeys)
    .eq("enabled", true);
  if (error) throw new Error(error.message);

  const providers = new Set<string>();
  for (const row of data ?? []) {
    const integration = Array.isArray(row.integrations) ? row.integrations[0] : row.integrations;
    if (integration?.provider) providers.add(String(integration.provider));
  }
  return [...providers];
}

export type { DepartmentContext };
