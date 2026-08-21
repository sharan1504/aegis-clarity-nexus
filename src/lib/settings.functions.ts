import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";

const FALLBACK_TIMEZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Vancouver", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Dublin", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Australia/Sydney", "Pacific/Auckland"] as const;

function getTimezones(): string[] {
  try {
    const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return Array.from(new Set(["UTC", ...FALLBACK_TIMEZONES, ...supported]));
  } catch {
    return [...FALLBACK_TIMEZONES];
  }
}

function normalizeTimezone(value: string | null | undefined, timezones: string[]): string {
  const candidate = String(value ?? "").trim();
  if (timezones.includes(candidate)) return candidate;
  const aliases: Record<string, string> = { "Asia/Calcutta": "Asia/Kolkata", "US/Eastern": "America/New_York", "US/Central": "America/Chicago", "US/Mountain": "America/Denver", "US/Pacific": "America/Los_Angeles" };
  return aliases[candidate] && timezones.includes(aliases[candidate]) ? aliases[candidate] : "UTC";
}

type SecuritySettings = { dataMasking: boolean; requireApprovalForWrites: boolean; autoGenerateRollbackPlans: boolean };

function normalizeSecuritySettings(value: unknown): SecuritySettings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { dataMasking: source.dataMasking !== false, requireApprovalForWrites: source.requireApprovalForWrites !== false, autoGenerateRollbackPlans: source.autoGenerateRollbackPlans !== false };
}

export const getWorkspaceSettings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { tenantId } = await resolveTenant(context.supabase, context.userId);
  const { data, error } = await context.supabase.from("tenants").select("id,name,slug,primary_domain,timezone,analytics_settings").eq("id", tenantId).single();
  if (error || !data) throw new Error(error?.message ?? "Workspace settings could not be loaded.");
  const row = data as typeof data & { primary_domain?: string | null; timezone?: string | null; analytics_settings?: Record<string, unknown> | null };
  const timezones = getTimezones();
  return { organizationName: row.name ?? "", primaryDomain: row.primary_domain ?? "", timezone: normalizeTimezone(row.timezone, timezones), analyticsSettings: row.analytics_settings ?? {}, securitySettings: normalizeSecuritySettings(row.analytics_settings?.security), timezones };
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
  const timezones = getTimezones();
  const timezone = normalizeTimezone(data.timezone, timezones);

  // Auth + tenant/admin authorization are established above. Load the service-role client
  // only inside this server handler so it cannot be bundled into browser code.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: current, error: currentError } = await supabaseAdmin.from("tenants").select("analytics_settings").eq("id", tenantId).single();
  if (currentError || !current) throw new Error(currentError?.message ?? "Workspace settings could not be loaded.");
  const currentSettings = current.analytics_settings && typeof current.analytics_settings === "object" ? current.analytics_settings as Record<string, unknown> : {};
  const currentSecurity = normalizeSecuritySettings(currentSettings.security);
  const security = { ...currentSecurity, ...(typeof data.securitySettings.requireApprovalForWrites === "boolean" ? { requireApprovalForWrites: data.securitySettings.requireApprovalForWrites } : {}), ...(typeof data.securitySettings.autoGenerateRollbackPlans === "boolean" ? { autoGenerateRollbackPlans: data.securitySettings.autoGenerateRollbackPlans } : {}) };
  const analyticsSettings = { ...currentSettings, ...data.analyticsSettings, security };
  const { error } = await supabaseAdmin.from("tenants").update({ name: data.organizationName, primary_domain: data.primaryDomain || null, timezone, analytics_settings: analyticsSettings }).eq("id", tenantId);
  if (error) throw new Error(error.message);
  return { ok: true as const, securitySettings: security, timezone };
});
