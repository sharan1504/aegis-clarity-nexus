import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";

const TIMEZONES = ["UTC", ...(Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [])].filter((value, index, all) => all.indexOf(value) === index);

type SecuritySettings = {
  dataMasking: boolean;
  requireApprovalForWrites: boolean;
  autoGenerateRollbackPlans: boolean;
};

function normalizeSecuritySettings(value: unknown): SecuritySettings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    dataMasking: source.dataMasking !== false,
    requireApprovalForWrites: source.requireApprovalForWrites !== false,
    autoGenerateRollbackPlans: source.autoGenerateRollbackPlans !== false,
  };
}

export const getWorkspaceSettings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const { data, error } = await context.supabase.from("tenants").select("id,name,slug,primary_domain,timezone,analytics_settings").eq("id", tenantId).single();
  if (error || !data) throw new Error(error?.message ?? "Workspace settings could not be loaded.");
  const row = data as typeof data & { primary_domain?: string | null; timezone?: string | null; analytics_settings?: Record<string, unknown> | null };
  return {
    organizationName: row.name,
    primaryDomain: row.primary_domain ?? "",
    timezone: row.timezone ?? "UTC",
    analyticsSettings: row.analytics_settings ?? {},
    securitySettings: normalizeSecuritySettings(row.analytics_settings?.security),
    timezones: TIMEZONES,
  };
});

export const updateWorkspaceSettings = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { organizationName: string; primaryDomain: string; timezone: string; analyticsSettings?: Record<string, unknown>; securitySettings?: Partial<SecuritySettings> }) => ({
  organizationName: String(input.organizationName ?? "").trim(),
  primaryDomain: String(input.primaryDomain ?? "").trim().toLowerCase(),
  timezone: String(input.timezone ?? "UTC").trim(),
  analyticsSettings: input.analyticsSettings ?? {},
  securitySettings: input.securitySettings ?? {},
})).handler(async ({ data, context }) => {
  const { tenantId, roles } = await resolveTenant(context.supabase, context.userId);
  if (!roles.includes("admin")) throw new Error("Only workspace administrators can update organization settings.");
  if (!data.organizationName) throw new Error("Organization name is required.");
  if (data.primaryDomain && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(data.primaryDomain)) throw new Error("Enter a valid primary domain.");
  if (!TIMEZONES.includes(data.timezone)) throw new Error("Select a valid timezone.");
  const db = context.supabase as any;
  const { data: current } = await db.from("tenants").select("analytics_settings").eq("id", tenantId).single();
  const currentSettings = current?.analytics_settings ?? {};
  const currentSecurity = normalizeSecuritySettings(currentSettings.security);
  const security = {
    ...currentSecurity,
    ...(typeof data.securitySettings.requireApprovalForWrites === "boolean" ? { requireApprovalForWrites: data.securitySettings.requireApprovalForWrites } : {}),
    ...(typeof data.securitySettings.autoGenerateRollbackPlans === "boolean" ? { autoGenerateRollbackPlans: data.securitySettings.autoGenerateRollbackPlans } : {}),
  };
  const analyticsSettings = { ...currentSettings, ...data.analyticsSettings, security };
  const { error } = await db.from("tenants").update({ name: data.organizationName, primary_domain: data.primaryDomain || null, timezone: data.timezone, analytics_settings: analyticsSettings }).eq("id", tenantId);
  if (error) throw new Error(error.message);
  return { ok: true as const, securitySettings: security };
});
