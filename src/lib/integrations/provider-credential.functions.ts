import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { connectCohesity } from "./provider-cohesity.server";
import { connectDatadog, connectPagerDuty } from "./provider-credential-functions.server";
import { connectMongoDbAtlas } from "./oauth-mongodb.server";
import { connectNewRelic } from "./oauth-newrelic.server";
import { connectRubrik } from "./oauth-rubrik.server";
import { connectVeeam } from "./oauth-veeam.server";
import { connectSplunk } from "./provider-splunk.server";
import { connectOkta } from "./api-okta.server";
import { connectDefender } from "./oauth-defender.server";

async function tenantFor(context: any) {
  const { tenantId, roles } = await resolveTenant(context.supabase, context.userId);
  if (!roles.includes("admin") && !roles.includes("manager")) throw new Error("Admin/manager access is required to connect an integration.");
  return tenantId;
}

export const startCohesityConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; baseUrl: string; apiKey: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => connectCohesity({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
export const startDatadogConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; apiKey: string; appKey: string; site?: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => connectDatadog({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
export const startPagerDutyConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; apiToken: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => connectPagerDuty({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
export const startMongoDbConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; clientId: string; clientSecret: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => connectMongoDbAtlas({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
export const startNewRelicConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; apiKey: string; region: "us" | "eu" | "jp"; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => connectNewRelic({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
export const startRubrikConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; clientId: string; clientSecret: string; accessTokenUri: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => connectRubrik({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
export const startVeeamConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; baseUrl: string; username: string; password: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => connectVeeam({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
export const startSplunkConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; baseUrl: string; token: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => connectSplunk({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
export const startOktaConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; baseUrl: string; apiToken: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => connectOkta({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
export const startDefenderConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: { connectionId?: string; clientId: string; clientSecret: string; customerTenantId?: string; displayName?: string; environment?: string }) => input).handler(async ({ data, context }) => connectDefender({ tenantId: await tenantFor(context), userId: context.userId, ...data }));
