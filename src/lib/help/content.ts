import { PROVIDER_HELP_TOPICS } from "./provider-guides";
import { HELP_TOPICS as BASE_HELP_TOPICS, type HelpSection as BaseHelpSection, type HelpTopic as BaseHelpTopic } from "./content-base";

export type HelpSection = BaseHelpSection;
export type HelpGroup = BaseHelpTopic["group"] | "Provider setup guides";
export type HelpTopic = Omit<BaseHelpTopic, "group"> & { group: HelpGroup };

const s = (heading: string, body: string, bullets?: string[], steps?: string[]): HelpSection => ({ heading, body, bullets, steps });

const connectedCriteria = "Connected requires all three facts: server-side credentials are present; the real provider health check is healthy; and a real synchronization succeeds with lastSuccessfulAt populated. Authentication alone is not Connected, and healthy health without successful sync is not Connected.";

const override = (id: string, topic: Omit<HelpTopic, "id">): HelpTopic => ({ id, ...topic });

const overrides: Record<string, HelpTopic> = {
  "platform-overview": override("platform-overview", {
    title: "Platform overview",
    group: "Getting started",
    summary: "CenOps is Aegis's AI Operations & Governance control plane: it collects operational evidence, applies governance, proposes governed actions, verifies outcomes, and records the audit trail.",
    sections: [
      s("What it is", "CenOps sits above enterprise execution systems rather than replacing them. Its working loop is Observe → Govern → Optimize → Act → Verify → Audit → Outcome."),
      s("How it works", "The platform is evidence-first. Contract-backed providers and synchronized snapshots supply operational evidence. A provider being present in the catalog does not mean its data is live or that its connector is contract-complete. Demo mode is explicitly labeled and uses fixtures instead of external providers."),
      s("Live provider prerequisite", "For live operational evidence, use a contract-backed provider and satisfy the connector's authentication, healthy health-check and successful-sync evidence requirements."),
      s("Integrity note", "Do not treat an approval record as proof that a provider mutation succeeded. Execution and verification are separate states."),
    ],
  }),
  "first-time-setup": override("first-time-setup", {
    title: "First-time setup checklist",
    group: "Getting started",
    summary: "A safe first run is: establish the workspace, configure people and departments, connect a contract-backed provider, synchronize it, then configure agents and governance.",
    sections: [
      s("What it is", "A practical sequence for moving from an authenticated empty workspace to a usable operational control plane."),
      s("Prerequisites", "Admin access for workspace configuration and a real provider account. Prefer a provider in the current contract-backed set for the first live integration."),
      s("Step-by-step", "Complete these in order.", [], ["Confirm organization name, domain and timezone in Settings.", "Invite workspace members and set least-privilege roles.", "Define department memberships and department-level access where used.", "Connect a contract-backed provider from Integrations.", "Run Sync Now and confirm healthy health evidence plus successful sync evidence.", "Review Governance and AI Agents only after their required live evidence exists."]),
      s("Common mistakes / integrity notes", "Do not assume a catalog icon or successful authentication means an integration is production-ready."),
    ],
  }),
  "integrations": override("integrations", {
    title: "Integrations",
    group: "Core control plane",
    summary: "Integrations manage tenant-scoped provider instances. Catalog presence is not the same as a production connector contract.",
    sections: [
      s("What it is", "The Integrations page creates and manages provider connection instances while keeping credential material server-side."),
      s("Connected definition", connectedCriteria, ["Credentials present", "Health check healthy", "Sync status success with lastSuccessfulAt"]),
      s("Current contract-backed providers", "The runtime contract set is Genesys Cloud, GitHub, Jira, Slack, Salesforce, ServiceNow and Microsoft 365 / Entra ID. Microsoft 365 is contract-backed; AWS and Azure are not currently in CONTRACT_IMPLEMENTED_PROVIDERS."),
      s("Catalog vs contract", "Provider registry membership, declared capabilities, OAuth metadata or an auth module do not prove contract completeness. Unsupported production providers remain outside the production connector path as provider_not_implemented."),
      s("Sync semantics", "Successful contract-backed synchronization persists provider evidence and reconciles entities absent from the latest successful snapshot as stale where the connector supports it."),
      s("Step-by-step", "Connect and validate a provider.", [], ["Open Integrations.", "Choose the provider and open its setup guide.", "Complete the provider's real OAuth/App/role/credential flow.", "Confirm the actual connection state.", "Run Sync Now where an implemented sync path exists.", "Confirm healthy health evidence and successful sync evidence before relying on Connected."]),
      s("Integrity notes", "Do not present a catalog entry as a live production connector. Do not infer Connected from authentication alone."),
    ],
    relatedRoutes: [{ label: "Integrations", to: "/integrations" }, { label: "How to connect a provider", to: "/help?topic=connect-provider", topic: "connect-provider" }],
  }),
  "connect-provider": override("connect-provider", {
    title: "How to connect a provider",
    group: "Configuration deep-dives",
    summary: "Choose the provider's real authentication model, complete auth/credential validation, then achieve healthy health + successful sync evidence before calling it Connected.",
    sections: [
      s("Connected definition", connectedCriteria),
      s("Authentication models", "Use the actual provider integration form.", ["OAuth 2.0: Genesys Cloud, Jira, Slack, Salesforce, ServiceNow, Freshworks, Zendesk, Zoho, HubSpot, GitLab, Confluence, Snowflake, Workday and other registry entries with OAuth modules.", "GitHub App: install the Aegis GitHub App and select repositories; do not substitute a personal access token.", "AWS IAM Role: use the role ARN with the generated external ID.", "Service account: GCP and Google Workspace use service-account material; auth availability does not mean the provider is in the generic contract set.", "API key / token: Cohesity, Okta, Datadog, New Relic, PagerDuty and Splunk use provider-specific credential forms."]),
      s("Current contract boundary", "Full read/sync contract: Genesys Cloud, GitHub, Jira, Slack, Salesforce, ServiceNow and Microsoft 365. Auth-implemented but contract-incomplete providers remain outside the contract allow-list. Catalog-only providers must not be expected to become Connected."),
      s("Provider guides", "Every provider in PROVIDER_REGISTRY has a dedicated `/help?topic=provider-<id>` setup guide with contract status, auth model, prerequisites, connect steps, health/sync expectations and capability boundaries."),
      s("Step-by-step", "Connect safely.", [], ["Open Integrations.", "Choose the provider and open its setup guide.", "Complete authorization or credential validation.", "Wait for the actual connection state.", "Run Sync Now where a production sync path exists.", "Confirm healthy health evidence and successful sync with lastSuccessfulAt before relying on Connected."]),
      s("Common mistakes / integrity notes", "A provider_not_implemented response means the provider is not admitted to the production contract path. Do not infer production support from registry availability or auth success."),
    ],
    relatedRoutes: [{ label: "Integrations", to: "/integrations" }],
  }),
  "recommendation-to-change": override("recommendation-to-change", {
    title: "How recommendations become governed changes",
    group: "Configuration deep-dives",
    summary: "Recommendations are advisory until they become a governed change record and complete the execution/verification lifecycle.",
    sections: [
      s("What it is", "A change record is the explicit bridge between an AI recommendation and a governed operational action."),
      s("GitHub create-issue", "GitHub create-issue is the first real governed external write: approved change record → server-authorized execution → GitHub mutation → provider read-back verification → post-change sync/reconciliation → immutable audit evidence."),
      s("UI stages", "Proposed → Approved / Ready to Execute → Executing → Verified | Failed. Verification Unsupported is only appropriate when authoritative provider verification is genuinely impossible and is not used for GitHub create-issue."),
      s("Read/sync-only providers", "Jira, Slack, Salesforce, ServiceNow and Microsoft 365 remain read/sync-only for external mutations unless implementation changes explicitly add a governed write and verification path."),
      s("Common mistakes / integrity notes", "Recommendations are not approvals. Approvals are not execution. Execution is not verification."),
    ],
    relatedRoutes: [{ label: "Approval Center", to: "/approvals" }, { label: "GitHub setup", to: "/help?topic=provider-github", topic: "provider-github" }],
  }),
  "approval-center": override("approval-center", {
    title: "Approval Center",
    group: "Core control plane",
    summary: "Approval Center records human authorization. Approval does not prove provider execution or verification.",
    sections: [
      s("GitHub governed write", "GitHub create-issue is the only currently documented external governed write. It requires an approved persisted change record, server-side authorization, GitHub App execution, provider read-back verification, post-change sync/reconciliation and immutable audit evidence."),
      s("UI stages", "Proposed → Approved / Ready to Execute → Executing → Verified | Failed. Verification Unsupported is not used for GitHub create-issue."),
      s("Other providers", "Jira, Slack, Salesforce, ServiceNow and Microsoft 365 remain read/sync-only for external mutations."),
      s("Integrity note", "Approval is not execution. Execution is not verification."),
    ],
    relatedRoutes: [{ label: "Approval Center", to: "/approvals" }, { label: "GitHub setup", to: "/help?topic=provider-github", topic: "provider-github" }],
  }),
  "verification-audit": override("verification-audit", {
    title: "How verification and audit work",
    group: "Configuration deep-dives",
    summary: "Verification confirms resulting provider state; audit records preserve the decision and execution trail.",
    sections: [
      s("GitHub governed verification", "For GitHub create-issue, verification reads the created issue back from GitHub, post-change sync/reconciliation refreshes control-plane evidence, and an immutable audit event records the execution and verification outcome."),
      s("Verification boundary", "Approval or execution alone must never be shown as Verified. Verified requires authoritative resulting-state evidence."),
    ],
    relatedRoutes: [{ label: "Approval Center", to: "/approvals" }, { label: "Audit", to: "/audit" }, { label: "GitHub setup", to: "/help?topic=provider-github", topic: "provider-github" }],
  }),
  "sync-health-worker": override("sync-health-worker", {
    title: "Sync, health, and job worker",
    group: "Operations",
    summary: "Health and sync evidence define current provider state; the durable worker is not currently verified as production-deployed.",
    sections: [
      s("Sync evidence", "The generic sync evidence fields are status, lastAttemptedAt, lastSuccessfulAt, recordCount and error. These fields, together with health evidence, support evidence-derived Connected."),
      s("Manual Sync Now", "Manual Sync Now is the supported operational path without depending on the unverified pg-boss worker deployment."),
      s("Reconciliation", "Successful contract-backed syncs reconcile persisted active entities against the latest provider snapshot and mark missing entities stale where implemented."),
      s("Worker truth", "A worker source file or queue entry point in the repository is not evidence of a persistent production worker deployment. Do not describe scheduled durable sync as live without deployment/health evidence."),
    ],
    relatedRoutes: [{ label: "Integrations", to: "/integrations" }, { label: "Operational Console", to: "/operational-console" }],
  }),
  "troubleshooting": override("troubleshooting", {
    title: "Troubleshooting",
    group: "Operations",
    summary: "Diagnose provider state from connection, health, sync and governance evidence rather than from UI labels alone.",
    sections: [
      s("Common scenarios", "Use these integrity-preserving interpretations.", ["Auth succeeded but status is pending → waiting for health + sync evidence.", "Health is healthy but sync failed → still not Connected.", "Provider returned provider_not_implemented → it is not on the production contract path yet; do not expect Connected.", "Approval exists but the GitHub issue was not created → check the change is Ready to Execute, confirm the governed execution path was reached, then inspect execution/audit evidence."]),
      s("Step-by-step", "Use this order.", [], ["Confirm Live vs Demo.", "Confirm tenant/department scope.", "Confirm provider connection state.", "Check health evidence.", "Check last sync and sync error/count.", "Re-run Sync Now or reconnect when appropriate.", "Inspect execution and audit evidence for governed writes."]),
    ],
    relatedRoutes: [{ label: "Integrations", to: "/integrations" }, { label: "Audit", to: "/audit" }],
  }),
};

export const HELP_TOPICS: HelpTopic[] = BASE_HELP_TOPICS.map((topic) => overrides[topic.id] ?? (topic as HelpTopic));

export const HELP_GROUPS: readonly HelpGroup[] = ["Getting started", "Core control plane", "Configuration deep-dives", "Operations", "Provider setup guides"];
export const HELP_TOPICS_WITH_PROVIDERS: HelpTopic[] = [...HELP_TOPICS, ...PROVIDER_HELP_TOPICS];
export const HELP_TOPIC_BY_ID = Object.fromEntries(HELP_TOPICS_WITH_PROVIDERS.map((topic) => [topic.id, topic])) as Record<string, HelpTopic>;
