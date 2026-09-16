import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { startJiraOAuth as startJira, completeJiraOAuth as completeJira } from "./oauth-jira.server";
import { startSalesforceOAuth as startSalesforce, completeSalesforceOAuth as completeSalesforce } from "./oauth-salesforce.server";
import { startServiceNowOAuth as startServiceNow, completeServiceNowOAuth as completeServiceNow } from "./oauth-servicenow.server";
import { startSlackOAuth as startSlack, completeSlackOAuth as completeSlack } from "./oauth-slack.server";
import { startHubSpotOAuth as startHubSpot, completeHubSpotOAuth as completeHubSpot } from "./oauth-hubspot.server";

async function tenantFor(context: any) { const { tenantId, roles } = await resolveTenant(context.supabase, context.userId); if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration."); return tenantId; }

export const startJiraOAuth = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => startJira({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
export const completeJiraOAuth = createServerFn({ method: "POST" }).inputValidator((input: { state: string; code: string }) => input).handler(async ({ data }) => completeJira(data.state, data.code));

export const startSalesforceOAuth = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; clientId: string; clientSecret?: string; redirectUri: string; displayName?: string; environment?: string; loginUrl?: string }) => input).handler(async ({ data, context }) => startSalesforce({ tenantId: await tenantFor(context), ...data }));
export const completeSalesforceOAuth = createServerFn({ method: "POST" }).inputValidator((input: { state: string; code: string }) => input).handler(async ({ data }) => completeSalesforce(data.state, data.code));

export const startServiceNowOAuth = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; instanceUrl: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string; scope?: string }) => input).handler(async ({ data, context }) => startServiceNow({ tenantId: await tenantFor(context), ...data }));
export const completeServiceNowOAuth = createServerFn({ method: "POST" }).inputValidator((input: { state: string; code: string }) => input).handler(async ({ data }) => completeServiceNow(data.state, data.code));

export const startSlackOAuth = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => startSlack({ tenantId: await tenantFor(context), ...data }));
export const completeSlackOAuth = createServerFn({ method: "POST" }).inputValidator((input: { state: string; code: string }) => input).handler(async ({ data }) => completeSlack(data.state, data.code));

export const startHubSpotOAuth = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; clientId: string; clientSecret: string; redirectUri: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => startHubSpot({ tenantId: await tenantFor(context), ...data }));
export const completeHubSpotOAuth = createServerFn({ method: "POST" }).inputValidator((input: { state: string; code: string }) => input).handler(async ({ data }) => completeHubSpot(data.state, data.code));
