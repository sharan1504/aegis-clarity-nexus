import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildProductivityReport, type ProductivityWindow } from "@/lib/productivity.functions";

type UserClient = SupabaseClient<Database>;
const PROVIDERS = ["jira", "github", "salesforce", "servicenow", "slack"] as const;

function parseWindow(input: string): ProductivityWindow {
  const text = input.toLowerCase();
  if (/\b(week|7 days|weekly)\b/.test(text)) return "week";
  if (/\b(6 months|six months|half year)\b/.test(text)) return "6_months";
  if (/\b(3 months|three months|quarter)\b/.test(text)) return "3_months";
  if (/\b(12 months|12 month|year|yearly|past year)\b/.test(text)) return "year";
  return "month";
}

function parseProvider(input: string): string | null {
  const lower = input.toLowerCase();
  return PROVIDERS.find((provider) => new RegExp(`\\b${provider}\\b`, "i").test(lower)) ?? null;
}

function parseUser(input: string): string | null {
  const match = input.match(/\bfor\s+([A-Za-z][A-Za-z0-9 .'-]{1,80}?)(?=\s+(?:for\s+)?(?:the\s+)?(?:last|past|this|previous|current)\b|\s+(?:week|month|quarter|year)\b|$)/i);
  return match?.[1]?.trim() ?? null;
}

export async function getProductivityActivity(supabase: UserClient, userId: string, input: string) {
  const provider = parseProvider(input);
  const user = parseUser(input);
  if (!provider || !user) {
    return { records: [], sources: [], warnings: ["Productivity Agent requires a provider and a target user in the run request. Example: Generate a Jira productivity report for Alex for the last 3 months."], report: null };
  }
  const report = await buildProductivityReport(supabase, userId, { provider, user, window: parseWindow(input) });
  return {
    records: report.rows,
    sources: report.sources,
    warnings: report.warnings,
    report,
  };
}
