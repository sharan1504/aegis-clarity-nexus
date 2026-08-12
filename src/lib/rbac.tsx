import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useTenantContext, type AppRole } from "@/lib/tenant";

export type Role = "Admin" | "Manager" | "Analyst" | "Viewer";

export type Permission =
  | "approvals.approve"
  | "approvals.reject"
  | "agents.deploy"
  | "agents.pause"
  | "integrations.configure"
  | "users.manage"
  | "settings.write"
  | "reports.export";

const MATRIX: Record<Role, Permission[]> = {
  Admin: [
    "approvals.approve",
    "approvals.reject",
    "agents.deploy",
    "agents.pause",
    "integrations.configure",
    "users.manage",
    "settings.write",
    "reports.export",
  ],
  Manager: [
    "approvals.approve",
    "approvals.reject",
    "agents.pause",
    "integrations.configure",
    "reports.export",
  ],
  Analyst: ["approvals.reject"],
  Viewer: [],
};

const RANK: Role[] = ["Admin", "Manager", "Analyst", "Viewer"];

const DB_TO_ROLE: Record<AppRole, Role> = {
  admin: "Admin",
  manager: "Manager",
  analyst: "Analyst",
  viewer: "Viewer",
};

/**
 * Effective role is derived from the authenticated user's real rows in the
 * user_roles table (loaded by TenantProvider). It is never client-selectable;
 * the database RLS policies enforce the same rules server-side.
 */
function effectiveRole(roles: AppRole[]): Role {
  const mapped = roles.map((r) => DB_TO_ROLE[r]).filter(Boolean);
  for (const candidate of RANK) {
    if (mapped.includes(candidate)) return candidate;
  }
  return "Viewer";
}

interface RoleCtx {
  role: Role;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { roles } = useTenantContext();
  const role = effectiveRole(roles);
  const value = useMemo<RoleCtx>(
    () => ({ role, can: (p) => MATRIX[role].includes(p) }),
    [role],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRole() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRole must be inside RoleProvider");
  return c;
}

export function RoleGate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useRole();
  return <>{can(permission) ? children : fallback}</>;
}

export const ROLES: Role[] = RANK;
