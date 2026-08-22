/**
 * Reusable audit event schema for the Aegis platform.
 *
 * This module is provider-neutral on purpose: connectors, agents, guardrails and
 * the change-control engine all write the SAME event shape into the audit stream
 * through `AuditRepository` (see ./repository.ts).
 */
export type AuditRisk = "critical" | "high" | "medium" | "low" | "info";
export type AuditResult = "success" | "failure" | "warning" | "pending";
export type AuditResourceType = "user" | "role" | "license" | "integration" | "agent" | "change_record" | "approval_policy" | "recommendation" | "report" | "session" | "security" | "configuration";
export type AuditAction =
  | "user.added" | "user.updated" | "user.removed" | "user.deactivated" | "user.role_changed" | "user.permission_changed"
  | "license.assigned" | "license.unassigned" | "license.changed"
  | "integration.connected" | "integration.disconnected" | "integration.auth_failed" | "integration.reconnected"
  | "agent.connected" | "agent.enabled" | "agent.disconnected" | "agent.disabled" | "agent.config_changed"
  | "recommendation.created" | "change.created" | "change.approved" | "change.rejected" | "change.executed" | "change.execution_failed" | "approval_policy.changed"
  | "report.generated" | "report.exported"
  | "auth.login" | "auth.logout" | "auth.login_failed" | "auth.mfa_challenge" | "security.config_changed" | "security.guardrail_changed";

export interface AuditFieldChange { field: string; oldValue: string | null; newValue: string | null; }
export interface AuditActor { id: string; name: string; email: string; role: "Admin" | "Manager" | "Analyst" | "Viewer" | "System"; type: "human" | "agent" | "system"; }
export interface AuditSource { channel: "web" | "api" | "agent" | "scheduler" | "webhook"; ip?: string | null; device?: string | null; location?: string | null; }
export interface AuditEvent {
  id: string; correlationId: string; timestamp: string; actor: AuditActor; action: AuditAction; resourceType: AuditResourceType; resourceName: string; targetId: string | null;
  integration?: string | null; agent?: string | null; changes: AuditFieldChange[]; reason?: string | null; approvalId?: string | null;
  approvalStatus?: "approved" | "rejected" | "pending" | "not_required"; result: AuditResult; risk: AuditRisk; source: AuditSource;
  metadata?: Record<string, string | number | boolean | null>; seeded?: boolean;
}

export type AuditTimeRange = "today" | "7d" | "30d" | "60d" | "90d" | "custom";
export interface AuditFilters {
  search?: string; range?: AuditTimeRange; from?: string | null; to?: string | null;
  actorId?: string | "all"; action?: AuditAction | "all"; resourceType?: AuditResourceType | "all";
  integration?: string | "all"; agent?: string | "all"; result?: AuditResult | "all"; risk?: AuditRisk | "all";
  role?: AuditActor["role"] | "all"; approvalStatus?: NonNullable<AuditEvent["approvalStatus"]> | "all"; correlationId?: string;
}
export interface AuditStats { total: number; today: number; highRisk: number; failed: number; }

export const ACTION_LABELS: Record<AuditAction, string> = {
  "user.added": "User added", "user.updated": "User updated", "user.removed": "User removed", "user.deactivated": "User deactivated", "user.role_changed": "Role changed", "user.permission_changed": "Permission changed",
  "license.assigned": "License assigned", "license.unassigned": "License unassigned", "license.changed": "License changed",
  "integration.connected": "Integration connected", "integration.disconnected": "Integration disconnected", "integration.auth_failed": "Integration auth failed", "integration.reconnected": "Integration reconnected",
  "agent.connected": "Agent connected", "agent.enabled": "Agent enabled", "agent.disconnected": "Agent disconnected", "agent.disabled": "Agent disabled", "agent.config_changed": "Agent configuration changed",
  "recommendation.created": "Recommendation created", "change.created": "Change created", "change.approved": "Change approved", "change.rejected": "Change rejected", "change.executed": "Change executed", "change.execution_failed": "Change execution failed", "approval_policy.changed": "Approval policy changed",
  "report.generated": "Report generated", "report.exported": "Report exported",
  "auth.login": "Login", "auth.logout": "Logout", "auth.login_failed": "Login failed", "auth.mfa_challenge": "MFA challenge", "security.config_changed": "Security configuration changed", "security.guardrail_changed": "Guardrail changed",
};

export const RESOURCE_LABELS: Record<AuditResourceType, string> = {
  user: "User", role: "Role", license: "License", integration: "Integration", agent: "Agent", change_record: "Change record", approval_policy: "Approval policy", recommendation: "Recommendation", report: "Report", session: "Session", security: "Security", configuration: "Configuration",
};