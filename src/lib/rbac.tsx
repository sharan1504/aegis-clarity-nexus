import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

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

interface RoleCtx {
  role: Role;
  setRole: (r: Role) => void;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(() => {
    if (typeof window === "undefined") return "Admin";
    return (localStorage.getItem("aegis.role") as Role) || "Admin";
  });
  const setRole = (r: Role) => {
    setRoleState(r);
    if (typeof window !== "undefined") localStorage.setItem("aegis.role", r);
  };
  const value = useMemo<RoleCtx>(
    () => ({ role, setRole, can: (p) => MATRIX[role].includes(p) }),
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

export const ROLES: Role[] = ["Admin", "Manager", "Analyst", "Viewer"];
