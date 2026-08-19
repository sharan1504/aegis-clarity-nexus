// Server-only runtime for the License Agent.
//
// Runtime flow:
//   authenticated user -> agent-license -> capability router -> policy engine
//   -> provider-neutral License analysis -> structured result
//
// This module deliberately does not call provider APIs, hold credentials, or
// perform mutations. The Capability Router remains the authorization +
// guardrail enforcement point.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { capabilityRouter } from "@/lib/capabilities/router.server";
import {
  evaluateEntitlementPolicyPerIntegration,
  type PolicyEvaluationContext,
} from "@/lib/capabilities/policy-engine";
import {
  buildLicenseAssignments,
  buildLicenseSummary,
  buildLicenseUsage,
  buildUnusedLicenseCandidates,
  buildUserLicenseDetails,
} from "./analysis";
import {
  LICENSE_AGENT_KEY,
  LICENSE_ERROR_MESSAGES,
  LICENSE_OPERATIONS,
  parseLicenseFilters,
  type FilterIssue,
  type LicenseOperation,
} from "./types";

const MAX_ASSIGNMENT_RESULTS = 1000;

export interface LicenseAgentRequest {
  operation: LicenseOperation;
  filters?: unknown;
}

function invalidRequest(message: string, issues: FilterIssue[] = []) {
  return {
    ok: false as const,
    error: {
      code: "invalid_filters" as const,
      message,
      issues,
    },
  };
}

function normalizeOperation(input: unknown): LicenseOperation | null {
  if (typeof input !== "string") return null;
  return (LICENSE_OPERATIONS as string[]).includes(input) ? (input as LicenseOperation) : null;
}

function resultMeta(operation: LicenseOperation, routed: {
  freshness: any;
  sources: any[];
  warnings: string[];
  policies: Record<string, { policy: any; revision: { version: number } }>;
  evaluatedAt: string;
}) {
  return {
    operation,
    evaluatedAt: routed.evaluatedAt,
    freshness: routed.freshness,
    sources: routed.sources,
    warnings: routed.warnings,
    policies: Object.fromEntries(
      Object.entries(routed.policies).map(([integrationId, entry]) => [integrationId, {
        version: entry.revision.version,
        policy: entry.policy,
      }]),
    ),
    truncated: false,
    readOnly: true as const,
  };
}

function deniedResult(operation: LicenseOperation, routed: {
  denied?: { reason: string; message: string };
  warnings: string[];
  freshness: any;
  sources: any[];
  policies: Record<string, { policy: any; revision: { version: number } }>;
  evaluatedAt: string;
}) {
  const reason = routed.denied?.reason ?? "capability_denied";
  const code = reason === "guardrail_denied" ? "guardrail_denied" : "capability_denied";
  return {
    ok: false as const,
    error: {
      code,
      message: routed.denied?.message ?? LICENSE_ERROR_MESSAGES[code],
      issues: [],
    },
    meta: resultMeta(operation, routed),
  };
}

function freshestByIntegration(routed: {
  sources: Array<{ integrationId: string; freshness: any }>;
}) {
  return Object.fromEntries(routed.sources.map((s) => [s.integrationId, s.freshness]));
}

function policiesForEvaluation(routed: {
  policies: Record<string, { policy: any; revision: any }>;
}) {
  return Object.fromEntries(
    Object.entries(routed.policies).map(([integrationId, entry]) => [integrationId, {
      policy: entry.policy,
      revision: entry.revision,
    }]),
  );
}

/**
 * Execute one read-only License Agent operation.
 *
 * The caller supplies only the operation and optional filters. Tenant,
 * integrations, providers, policies and guardrails are resolved server-side.
 */
export const executeLicenseAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: LicenseAgentRequest) => ({
    operation: input?.operation,
    filters: input?.filters,
  }))
  .handler(async ({ data, context }) => {
    const operation = normalizeOperation(data.operation);
    if (!operation) {
      return invalidRequest(
        `Unsupported License Agent operation. Supported operations: ${LICENSE_OPERATIONS.join(", ")}.`,
      );
    }

    const parsed = parseLicenseFilters(data.filters, ["licenseId", "licenseName", "userId", "userName", "userEmail"]);
    if (!parsed.ok) {
      return invalidRequest("The supplied License Agent filters are not valid.", parsed.issues);
    }

    const filters = parsed.filters;
    const now = Date.now();

    try {
      switch (operation) {
        case "get_license_summary": {
          const [entitlements, users] = await Promise.all([
            capabilityRouter.getLicenseInventory(context.supabase, context.userId, LICENSE_AGENT_KEY, { now }),
            capabilityRouter.getUsers(context.supabase, context.userId, LICENSE_AGENT_KEY, { now }),
          ]);

          if (entitlements.denied) return deniedResult(operation, entitlements);
          if (users.denied) return deniedResult(operation, users);

          const data = buildLicenseSummary(entitlements.records, users.records);
          return {
            ok: true as const,
            data,
            meta: {
              ...resultMeta(operation, entitlements),
              sources: [...entitlements.sources, ...users.sources],
              warnings: [...entitlements.warnings, ...users.warnings],
              freshness: entitlements.freshness,
            },
          };
        }

        case "get_license_usage": {
          const routed = await capabilityRouter.getLicenseInventory(
            context.supabase,
            context.userId,
            LICENSE_AGENT_KEY,
            { now },
          );
          if (routed.denied) return deniedResult(operation, routed);

          return {
            ok: true as const,
            data: buildLicenseUsage(routed.records, filters),
            meta: resultMeta(operation, routed),
          };
        }

        case "get_license_assignments": {
          const routed = await capabilityRouter.getLicenseInventory(
            context.supabase,
            context.userId,
            LICENSE_AGENT_KEY,
            { now },
          );
          if (routed.denied) return deniedResult(operation, routed);

          const data = buildLicenseAssignments(
            routed.records,
            filters,
            now,
            MAX_ASSIGNMENT_RESULTS,
          );
          return {
            ok: true as const,
            data,
            meta: {
              ...resultMeta(operation, routed),
              truncated: data.totalMatched > MAX_ASSIGNMENT_RESULTS,
            },
          };
        }

        case "get_user_license_details": {
          const [entitlements, users] = await Promise.all([
            capabilityRouter.getLicenseInventory(context.supabase, context.userId, LICENSE_AGENT_KEY, { now }),
            capabilityRouter.getUsers(context.supabase, context.userId, LICENSE_AGENT_KEY, { now }),
          ]);

          if (entitlements.denied) return deniedResult(operation, entitlements);
          if (users.denied) return deniedResult(operation, users);

          // Natural-language chat commonly identifies a user by display name.
          // Resolve that name to the canonical userId before building details so
          // the analysis layer can continue to use its provider-neutral filters.
          const resolvedFilters = { ...filters };
          if (!resolvedFilters.userId && !resolvedFilters.userEmail && resolvedFilters.userName) {
            const wantedName = resolvedFilters.userName.trim().toLowerCase();
            const matchingUsers = users.records.filter(
              (u) => (u.userName ?? "").trim().toLowerCase() === wantedName,
            );
            if (matchingUsers.length > 0) {
              resolvedFilters.userId = matchingUsers[0].userId;
            }
          }

          const data = buildUserLicenseDetails(users.records, entitlements.records, resolvedFilters, now);
          if (!data) {
            return {
              ok: false as const,
              error: {
                code: "not_found" as const,
                message: LICENSE_ERROR_MESSAGES.not_found,
                issues: [],
              },
              meta: {
                ...resultMeta(operation, entitlements),
                sources: [...entitlements.sources, ...users.sources],
                warnings: [...entitlements.warnings, ...users.warnings],
              },
            };
          }

          return {
            ok: true as const,
            data,
            meta: {
              ...resultMeta(operation, entitlements),
              sources: [...entitlements.sources, ...users.sources],
              warnings: [...entitlements.warnings, ...users.warnings],
            },
          };
        }

        case "get_unused_license_candidates": {
          const [entitlements, users, queues] = await Promise.all([
            capabilityRouter.getLicenseInventory(context.supabase, context.userId, LICENSE_AGENT_KEY, { now }),
            capabilityRouter.getUsers(context.supabase, context.userId, LICENSE_AGENT_KEY, { now }),
            capabilityRouter.getQueues(context.supabase, context.userId, LICENSE_AGENT_KEY, { now }),
          ]);

          if (entitlements.denied) return deniedResult(operation, entitlements);
          if (users.denied) return deniedResult(operation, users);
          if (queues.denied) return deniedResult(operation, queues);

          const policies = policiesForEvaluation(entitlements);
          const policyContext: PolicyEvaluationContext = {
            now,
            activeQueueMemberUserIds: [],
            provisionedAtByUserId: Object.fromEntries(
              users.records.map((u) => [u.userId, (u.metadata["accountCreatedAt"] as string | null | undefined) ?? null]),
            ),
          };

          const evaluations = evaluateEntitlementPolicyPerIntegration(
            entitlements.records,
            policies,
            policyContext,
          );

          const built = buildUnusedLicenseCandidates(
            entitlements.records,
            evaluations,
            Object.fromEntries(
              Object.entries(policies).map(([integrationId, entry]) => [integrationId, {
                policy: entry.policy,
                version: entry.revision?.version ?? 1,
              }]),
            ),
            {
              now,
              queueMembershipAvailableByIntegration: Object.fromEntries(
                queues.sources.map((s) => [s.integrationId, false]),
              ),
              freshnessByIntegration: freshestByIntegration(entitlements),
            },
          );

          return {
            ok: true as const,
            data: built.payload,
            meta: {
              ...resultMeta(operation, entitlements),
              warnings: [
                ...entitlements.warnings,
                ...users.warnings,
                ...queues.warnings,
                ...built.warnings,
              ],
            },
          };
        }
      }
    } catch (error) {
      console.error("[license-agent] execution failed", {
        operation,
        agentKey: LICENSE_AGENT_KEY,
        error: error instanceof Error ? error.message : "unknown error",
      });

      return {
        ok: false as const,
        error: {
          code: "unavailable" as const,
          message: LICENSE_ERROR_MESSAGES.unavailable,
          issues: [],
        },
        meta: {
          operation,
          evaluatedAt: new Date(now).toISOString(),
          freshness: "unavailable" as const,
          sources: [],
          warnings: [],
          policies: {},
          truncated: false,
          readOnly: true as const,
        },
      };
    }
  });
