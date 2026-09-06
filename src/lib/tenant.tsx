// Tenant + session bootstrap for the multi-tenant Aegis backend.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { initRealtime, teardownRealtime } from "@/lib/realtime";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
export type AppRole = "admin" | "manager" | "analyst" | "viewer";

export interface TenantContextValue {
  user: User | null;
  tenantId: string | null;
  tenantName: string | null;
  primaryDomain: string | null;
  roles: AppRole[];
  environmentMode: "live" | "demo";
  loading: boolean;
  /** Re-reads tenant identity (name, primary domain, roles) from the database. */
  refreshTenant: () => Promise<void>;
}

function tenantNameFromEmail(email: string | undefined) {
  const domain = (email ?? "").split("@")[1] ?? "workspace";
  const base = domain.split(".")[0] ?? "workspace";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "workspace"
  );
}

/**
 * Ensures the signed-in user has a profile, a tenant, and an admin role.
 * First tenant created is seeded with the demo operational dataset so the
 * workspace is not empty on first login.
 */
export async function ensureTenantBootstrap(user: User): Promise<{
  tenantId: string;
  tenantName: string;
  primaryDomain: string | null;
  roles: AppRole[];
}> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, tenant_id, tenants(name, primary_domain, environment_mode)")
    .eq("id", user.id)
    .maybeSingle();

  const existingTenant = (existing as {
    tenants?: { name?: string | null; primary_domain?: string | null; environment_mode?: string | null } | null;
  } | null)?.tenants ?? null;

  let tenantId = existing?.tenant_id ?? null;
  let tenantName = existingTenant?.name ?? null;
  const primaryDomain = existingTenant?.primary_domain ?? null;
  const environmentMode = existingTenant?.environment_mode === "demo" ? "demo" : "live";

  if (!existing) {
    await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? null,
      full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    });
  }

  if (!tenantId) {
    const name = tenantNameFromEmail(user.email ?? undefined);
    const slug = `${slugify(name)}-${user.id.slice(0, 8)}`;
    const { data: tenant, error } = await supabase
      .from("tenants")
      .insert({ name, slug })
      .select("id, name")
      .single();
    if (error || !tenant) throw error ?? new Error("Could not create workspace");

    tenantId = tenant.id;
    tenantName = tenant.name;

    await supabase.from("profiles").update({ tenant_id: tenantId }).eq("id", user.id);
    await supabase
      .from("user_roles")
      .insert({ user_id: user.id, tenant_id: tenantId, role: "admin" });
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId);

  return {
    tenantId: tenantId!,
    tenantName: tenantName ?? "Workspace",
    primaryDomain,
    roles: (roleRows ?? []).map((r) => r.role as AppRole),
    environmentMode,
  };
}

const EMPTY_TENANT_STATE = {
  user: null,
  tenantId: null,
  tenantName: null,
  primaryDomain: null,
  roles: [] as AppRole[],
  environmentMode: "live",
  loading: true,
};

/** Session + tenant state for the app shell. */
export function useTenant(): TenantContextValue {
  const [state, setState] = useState<Omit<TenantContextValue, "refreshTenant">>(EMPTY_TENANT_STATE);
  const activeRef = useRef(true);

  // Single resolver shared by auth events and explicit refreshes, so the
  // organization name has exactly one source of truth (the database).
  const resolve = useCallback(async (user: User | null) => {
    if (!user) {
      if (activeRef.current) setState({ ...EMPTY_TENANT_STATE, loading: false });
      return;
    }
    try {
      const { tenantId, tenantName, primaryDomain, roles, environmentMode } = await ensureTenantBootstrap(user);
      if (activeRef.current) {
        setState({ user, tenantId, tenantName, primaryDomain, roles, environmentMode, loading: false });
      }
    } catch {
      if (activeRef.current) {
        setState({ ...EMPTY_TENANT_STATE, user, loading: false });
      }
    }
  }, []);

  const refreshTenant = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    await resolve(data.user ?? null);
  }, [resolve]);

  useEffect(() => {
    if (!state.tenantId) return;
    const channel = supabase
      .channel(`tenant-environment-${state.tenantId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tenants", filter: `id=eq.${state.tenantId}` }, (payload) => {
        const mode = (payload.new as { environment_mode?: string }).environment_mode === "demo" ? "demo" : "live";
        setState((current) => ({ ...current, environmentMode: mode }));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [state.tenantId]);

  useEffect(() => {
    activeRef.current = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      void resolve(session?.user ?? null);
    });

    void supabase.auth.getUser().then(({ data }) => resolve(data.user ?? null));

    return () => {
      activeRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, [resolve]);

  return { ...state, refreshTenant };
}

const TenantContext = createContext<TenantContextValue>({
  ...EMPTY_TENANT_STATE,
  refreshTenant: async () => {},
});

/** Provides session + tenant state and keeps Realtime bound to the active tenant. */
export function TenantProvider({ children }: { children: ReactNode }) {
  const value = useTenant();

  useEffect(() => {
    if (value.tenantId) initRealtime(value.tenantId);
    else if (!value.loading) teardownRealtime();
  }, [value.tenantId, value.loading]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenantContext() {
  return useContext(TenantContext);
}
