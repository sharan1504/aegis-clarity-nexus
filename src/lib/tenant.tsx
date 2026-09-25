import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { initRealtime, teardownRealtime } from "@/lib/realtime";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { provisionPersonalWorkspace } from "@/lib/tenant-provision.functions";

export type AppRole = "admin" | "manager" | "analyst" | "viewer";
export type EnvironmentMode = "live" | "demo";
export interface TenantContextValue {
  user: User | null;
  tenantId: string | null;
  tenantName: string | null;
  primaryDomain: string | null;
  roles: AppRole[];
  environmentMode: EnvironmentMode;
  loading: boolean;
  provisioningError: string | null;
  refreshTenant: () => Promise<void>;
}

export async function ensureTenantBootstrap(user: User) {
  const provisioned = await provisionPersonalWorkspace();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    throw new Error("Workspace membership could not be loaded.");
  }
  if (profile.tenant_id !== provisioned.tenantId) {
    throw new Error("Workspace membership could not be verified.");
  }

  const [tenantResult, rolesResult] = await Promise.all([
    supabase
      .from("tenants")
      .select("name,primary_domain,environment_mode")
      .eq("id", profile.tenant_id)
      .single(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", profile.tenant_id),
  ]);

  if (tenantResult.error || !tenantResult.data) {
    throw new Error("Workspace details could not be loaded.");
  }
  if (rolesResult.error || !rolesResult.data?.length) {
    throw new Error("Workspace role could not be loaded.");
  }

  return {
    tenantId: profile.tenant_id,
    tenantName: tenantResult.data.name,
    primaryDomain: tenantResult.data.primary_domain,
    roles: rolesResult.data.map((row) => row.role as AppRole),
    environmentMode: tenantResult.data.environment_mode === "demo" ? "demo" : "live",
  };
}

const EMPTY_TENANT_STATE = {
  user: null,
  tenantId: null,
  tenantName: null,
  primaryDomain: null,
  roles: [] as AppRole[],
  environmentMode: "live" as EnvironmentMode,
  loading: true,
  provisioningError: null as string | null,
};

export function useTenant(): TenantContextValue {
  const [state, setState] = useState<Omit<TenantContextValue, "refreshTenant">>(EMPTY_TENANT_STATE);
  const activeRef = useRef(true);

  const resolve = useCallback(async (user: User | null) => {
    if (!user) {
      if (activeRef.current) setState({ ...EMPTY_TENANT_STATE, loading: false });
      return;
    }

    if (activeRef.current) {
      setState({ ...EMPTY_TENANT_STATE, user, loading: true });
    }

    try {
      const resolved = await ensureTenantBootstrap(user);
      if (activeRef.current) {
        setState({ user, ...resolved, loading: false, provisioningError: null });
      }
    } catch (error) {
      if (activeRef.current) {
        setState({
          ...EMPTY_TENANT_STATE,
          user,
          loading: false,
          provisioningError:
            error instanceof Error
              ? error.message
              : "We could not set up your workspace. Please retry or sign out.",
        });
      }
    }
  }, []);

  const refreshTenant = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (activeRef.current) {
        setState((current) => ({
          ...current,
          loading: false,
          provisioningError: "Your session could not be verified. Please sign out and try again.",
        }));
      }
      return;
    }
    await resolve(data.user ?? null);
  }, [resolve]);

  useEffect(() => {
    activeRef.current = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      void resolve(session?.user ?? null);
    });
    void refreshTenant();
    return () => {
      activeRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshTenant, resolve]);

  return { ...state, refreshTenant };
}

const TenantContext = createContext<TenantContextValue>({
  ...EMPTY_TENANT_STATE,
  refreshTenant: async () => {},
});

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
