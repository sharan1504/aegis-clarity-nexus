// Read-only, provider-neutral optimization analysis for the License Agent.
// This deliberately avoids hard-coding a single optimization use case such as
// 90-day inactivity. It reports evidence-backed review areas and explicit data
// limitations; it never performs or authorizes a license change.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { capabilityRouter } from "@/lib/capabilities/router.server";
import { LICENSE_AGENT_KEY } from "./types";

export interface LicenseOptimizationInsight {
  kind: "review_area" | "data_quality";
  title: string;
  statement: string;
  evidence: string[];
  confidence: "high" | "medium";
}

export interface LicenseOptimizationAnalysis {
  analyzedAt: string;
  readOnly: true;
  users: number;
  assignments: number;
  licenseTypes: number;
  multiLicenseUsers: number;
  insights: LicenseOptimizationInsight[];
  limitations: string[];
}

function sourceFreshness(sources: Array<{ freshness: string }>): string {
  const values = sources.map((s) => s.freshness);
  if (values.includes("unavailable")) return "unavailable";
  if (values.includes("stale")) return "stale";
  if (values.includes("aging")) return "aging";
  return "fresh";
}

export const executeLicenseOptimization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = Date.now();
    const [entitlements, users] = await Promise.all([
      capabilityRouter.getLicenseInventory(context.supabase, context.userId, LICENSE_AGENT_KEY, { now }),
      capabilityRouter.getUsers(context.supabase, context.userId, LICENSE_AGENT_KEY, { now }),
    ]);

    if (entitlements.denied) {
      throw new Error(entitlements.denied.message);
    }
    if (users.denied) {
      throw new Error(users.denied.message);
    }

    const byLicense = new Map<string, { name: string | null; count: number }>();
    const byUser = new Map<string, Set<string>>();
    let usersWithoutActivity = 0;

    for (const entitlement of entitlements.records) {
      const license = byLicense.get(entitlement.entitlementId) ?? {
        name: entitlement.entitlementName,
        count: 0,
      };
      license.count += 1;
      if (!license.name && entitlement.entitlementName) license.name = entitlement.entitlementName;
      byLicense.set(entitlement.entitlementId, license);

      const licenses = byUser.get(entitlement.userId) ?? new Set<string>();
      licenses.add(entitlement.entitlementId);
      byUser.set(entitlement.userId, licenses);

      if (!entitlement.lastActivityAt) usersWithoutActivity += 1;
    }

    const multiLicenseUsers = [...byUser.values()].filter((licenses) => licenses.size > 1).length;
    const freshness = sourceFreshness([
      ...entitlements.sources,
      ...users.sources,
    ]);

    const insights: LicenseOptimizationInsight[] = [];
    const limitations: string[] = [];

    if (multiLicenseUsers > 0) {
      insights.push({
        kind: "review_area",
        title: "Multiple-license assignments detected",
        statement: `${multiLicenseUsers} users have more than one assigned license. This is a review opportunity, not proof that any license should be removed.`,
        evidence: [
          `${multiLicenseUsers} users have multiple license IDs in the current assignment snapshot.`,
          `${entitlements.records.length} total license assignments were evaluated.`,
        ],
        confidence: "high",
      });
    }

    const topLicenses = [...byLicense.values()].sort((a, b) => b.count - a.count).slice(0, 3);
    if (topLicenses.length > 0) {
      insights.push({
        kind: "review_area",
        title: "License allocation concentration",
        statement: "The current snapshot shows where assignments are concentrated, which can guide customer questions about tiering, duplication, or demand.",
        evidence: topLicenses.map((license) => `${license.name ?? "Unnamed license"}: ${license.count} assignments.`),
        confidence: "high",
      });
    }

    if (usersWithoutActivity > 0) {
      limitations.push(
        `${usersWithoutActivity} license assignments do not have a reliable last-activity timestamp. Questions that require historical utilization cannot be answered from this snapshot alone.`,
      );
    }

    if (freshness === "stale" || freshness === "unavailable") {
      limitations.push(
        `The connected license/user data is ${freshness}; time-sensitive optimization conclusions should wait for a successful synchronization.`,
      );
    }

    limitations.push(
      "No automatic license-removal, downgrade, or reassignment recommendation is made without evidence that directly supports the customer's question.",
    );

    return {
      analyzedAt: new Date(now).toISOString(),
      readOnly: true as const,
      users: users.records.length,
      assignments: entitlements.records.length,
      licenseTypes: byLicense.size,
      multiLicenseUsers,
      insights,
      limitations,
    } satisfies LicenseOptimizationAnalysis;
  });
