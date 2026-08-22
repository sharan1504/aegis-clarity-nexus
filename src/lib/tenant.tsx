// Tenant + session bootstrap for the multi-tenant Aegis backend.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { initRealtime, teardownRealtime } from "@/lib/realtime";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  changeRecords as seedRecords,
  notifications as seedNotifications,
} from "@/lib/change-data";

export type AppRole = "admin" | "manager" | "analyst" | "viewer";

export interface TenantContextValue {
  user: User | null;
  tenantId: string | null;
  tenantName: string | null;
  primaryDomain: string | null;
  roles: AppRole[];
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
    .select("id, tenant_id, tenants(name, primary_domain)")
    .eq("id", user.id)
    .maybeSingle();

  const existingTenant = (existing as {
    tenants?: { name?: string | null; primary_domain?: string | null } | null;
  } | null)?.tenants ?? null;

  let tenantId = existing?.tenant_id ?? null;
  let tenantName = existingTenant?.name ?? null;
  let primaryDomain = existingTenant?.primary_domain ?? null;


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
    await seedTenant(tenantId, user.id);
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId);

  return {
    tenantId: tenantId!,
    tenantName: tenantName ?? "Workspace",
    roles: (roleRows ?? []).map((r) => r.role as AppRole),
  };
}

/** Seeds a brand-new tenant with the reference change-management dataset. */
async function seedTenant(tenantId: string, userId: string) {
  const { data: inserted, error } = await supabase
    .from("change_records")
    .insert(
      seedRecords.map((r) => ({
        tenant_id: tenantId,
        change_id: r.id,
        title: r.title,
        stage: r.stage,
        severity: r.severity,
        risk: r.risk as unknown as Json,
        execution_mode: r.executionMode,
        owner_team: r.ownerTeam,
        requester: r.requester,
        category: r.category,
        agent: r.agent,
        change_window: r.window as unknown as Json,
        business_impact: r.businessImpact,
        ai_reasoning: r.aiReasoning,
        rollback_steps: r.rollbackSteps as unknown as Json,
        validations: r.validations as unknown as Json,
        external_tickets: r.externalTickets as unknown as Json,
        timeline: r.timeline as unknown as Json,
      })),
    )
    .select("id, change_id");
  if (error) throw error;

  const byChangeId = new Map((inserted ?? []).map((row) => [row.change_id, row.id]));

  const approvals = seedRecords.flatMap((r) =>
    r.approvals.map((a, i) => ({
      tenant_id: tenantId,
      change_record_id: byChangeId.get(r.id)!,
      team: a.team,
      approver: a.approver,
      approver_role: a.role,
      status: a.status,
      decided_at: a.timestamp ?? null,
      comment: a.comment ?? null,
      position: i,
    })),
  );
  if (approvals.length) await supabase.from("change_approvals").insert(approvals);

  await supabase.from("notifications").insert(
    seedNotifications.map((n) => ({
      tenant_id: tenantId,
      kind: n.kind,
      title: n.title,
      body: n.body,
      href: n.href ?? null,
      unread: n.unread,
    })),
  );

  await supabase.from("audit_log").insert({
    tenant_id: tenantId,
    actor_id: userId,
    action: "workspace.provisioned",
    entity_type: "tenant",
    entity_id: tenantId,
    detail: "Workspace created and seeded with reference change-management dataset.",
    payload: { seededRecords: seedRecords.length },
  });
}

/** Session + tenant state for the app shell. */
export function useTenant(): TenantContextValue {
  const [state, setState] = useState<TenantContextValue>({
    user: null,
    tenantId: null,
    tenantName: null,
    roles: [],
    loading: true,
  });

  useEffect(() => {
    let active = true;

    const resolve = async (user: User | null) => {
      if (!user) {
        if (active) {
          setState({ user: null, tenantId: null, tenantName: null, roles: [], loading: false });
        }
        return;
      }
      try {
        const { tenantId, tenantName, roles } = await ensureTenantBootstrap(user);
        if (active) setState({ user, tenantId, tenantName, roles, loading: false });
      } catch {
        if (active) {
          setState({ user, tenantId: null, tenantName: null, roles: [], loading: false });
        }
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      void resolve(session?.user ?? null);
    });

    void supabase.auth.getUser().then(({ data }) => resolve(data.user ?? null));

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

const TenantContext = createContext<TenantContextValue>({
  user: null,
  tenantId: null,
  tenantName: null,
  roles: [],
  loading: true,
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
