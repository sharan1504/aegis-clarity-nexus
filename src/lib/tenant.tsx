import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { initRealtime, teardownRealtime } from "@/lib/realtime";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { provisionPersonalWorkspace } from "@/lib/tenant-provision.functions";
import { initializeOnboardingState } from "@/lib/onboarding.functions";

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
  if (provisioned.created) {
    try {
      await initializeOnboardingState();
    } catch (error) {
      // Onboarding is presentation-only; never fail workspace bootstrap because its state cannot be stored.
      console.warn("[onboarding] initialization failed", error);
    }
  }

  // The trusted server function has already created/verified the workspace and
  // returns the authoritative tenant + role payload. Do not immediately re-read
  // these rows through the browser client: RLS/session propagation can lag behind
  // the server-side service-role transaction and make a successful bootstrap look
  // like a failure.
  return {
    tenantId: provisioned.tenantId,
    tenantName: provisioned.tenantName,
    primaryDomain: provisioned.primaryDomain,
    roles: provisioned.roles,
    environmentMode: provisioned.environmentMode,
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
