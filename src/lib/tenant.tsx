import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTenantBootstrap } from "@/lib/tenant.functions";

type TenantContextValue = {
  tenantId: string | null;
  tenantName: string | null;
  primaryDomain: string | null;
  role: string | null;
  refreshTenant: () => Promise<void>;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const bootstrap = useServerFn(getTenantBootstrap);
  const [tenant, setTenant] = useState<{ tenantId: string | null; tenantName: string | null; primaryDomain: string | null; role: string | null }>({ tenantId: null, tenantName: null, primaryDomain: null, role: null });

  const refreshTenant = async () => {
    const data = await bootstrap();
    setTenant({ tenantId: data.tenantId, tenantName: data.tenantName, primaryDomain: data.primaryDomain, role: data.role });
  };

  useEffect(() => { void refreshTenant(); }, []);

  const value = useMemo(() => ({ ...tenant, refreshTenant }), [tenant]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenantContext() {
  const context = useContext(TenantContext);
  if (!context) throw new Error("useTenantContext must be used within TenantProvider");
  return context;
}

export async function resolveTenantForUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }) {
  const { createServerSupabaseClient } = await import("@/integrations/supabase/server");
  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, tenant_id, tenants(name, primary_domain)")
    .eq("id", user.id)
    .maybeSingle();

  const existingTenant = (existing as { tenants?: { name?: string | null; primary_domain?: string | null } | null } | null)?.tenants ?? null;
  let tenantId = existing?.tenant_id ?? null;
  const tenantName = existingTenant?.name ?? null;
  const primaryDomain = existingTenant?.primary_domain ?? null;

  if (!existing) {
    await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? null,
      full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    });
  }

  return { tenantId, tenantName, primaryDomain };
}
