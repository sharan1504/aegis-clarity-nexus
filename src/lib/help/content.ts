export type HelpSection = {
  heading: string;
  body: string;
  bullets?: string[];
  steps?: string[];
};

export type HelpGroup = "Getting started" | "Core control plane" | "Configuration deep-dives" | "Operations" | "Provider setup guides";

export type HelpTopic = {
  id: string;
  title: string;
  group: HelpGroup;
  summary: string;
  sections: HelpSection[];
  relatedRoutes?: Array<{ label: string; to: string; topic?: string }>;
};

const s = (heading: string, body: string, bullets?: string[], steps?: string[]): HelpSection => ({ heading, body, bullets, steps });

export const HELP_TOPICS: HelpTopic[] = [
  // Existing topics are retained below; provider-specific topics are merged from ./provider-guides.
  // The following contract-sensitive topics intentionally use the current runtime semantics.
  {
    id: "platform-overview",
    title: "Platform overview",
    group: "Getting started",
    summary: "CenOps is Aegis's AI Operations & Governance control plane: it collects operational evidence, applies governance, proposes governed actions, verifies outcomes, and records the audit trail.",
    sections: [
      s("What it is", "CenOps sits above enterprise execution systems rather than replacing them. Its working loop is Observe → Govern → Optimize → Act → Verify → Audit → Outcome.", ["Observe: contract-backed providers and synchronized snapshots supply operational evidence.", "Govern: platform baselines, organization guardrails, instructions and permissions constrain AI behavior.", "Optimize: agents, analytics and investigations turn evidence into findings and recommendations.", "Act: recommendations become change records and, where a write-capable connector and authorization exist, an approved execution.", "Verify + Audit: post-action verification, post-sync evidence and audit records establish what actually happened."]),
      s("Use cases", "Use CenOps when you need one operational control plane for AI-enabled enterprise operations.", ["Investigate an operational finding using persisted evidence.", "Ask Copilot for an evidence-grounded answer within the user's department scope.", "Connect enterprise systems and synchronize provider evidence before using live views.", "Govern AI and write actions with mandatory guardrails and approvals."]),
      s("How it works", "The platform is evidence-first. A provider being listed in the catalog does not mean its data is live or contract-complete. Live provider evidence requires a valid admitted connection plus the real health/sync evidence defined by the connector contract. Demo mode is explicitly labeled and uses fixtures instead of external providers."),
      s("Prerequisites", "An authenticated user with access to a tenant/workspace. For live operational evidence, use a contract-backed provider and complete its health and synchronization evidence requirements."),
    ],
    relatedRoutes: [{label:"Command Center",to:"/"},{label:"Integrations",to:"/integrations"},{label:"Copilot",to:"/chat"}],
  },
  {
    id: "first-time-setup",
    title: "First-time setup checklist",
    group: "Getting started",
    summary: "A safe first run is: establish the workspace, configure people and departments, connect a contract-backed provider, synchronize it, then configure agents and governance.",
    sections: [
      s("What it is", "A practical sequence for moving from an authenticated empty workspace to a usable operational control plane."),
      s("Prerequisites", "Admin access for workspace-level configuration and a real provider account for the first live integration."),
      s("Step-by-step", "Complete these in order.", [], ["Confirm organization name, domain and timezone in Settings.", "Invite workspace members from User Management and assign the least privilege role needed.", "Define department memberships and department-level agent/provider access where used.", "Connect a contract-backed provider from Integrations using its documented auth flow.", "Run Sync Now and confirm health/last-sync evidence.", "Review Governance and AI Agents only after their required live evidence exists.", "Use Command Center, Copilot and Investigations to validate the operational loop."]),
      s("Common mistakes / integrity notes", "Do not assume a catalog icon or successful authentication means an integration is production-ready."),
    ],
    relatedRoutes: [{label:"Settings",to:"/settings"},{label:"Users",to:"/users"},{label:"Integrations",to:"/integrations"}],
  },
  {
    id: "integrations",
    title: "Integrations",
    group: "Core control plane",
    summary: "Integrations manage tenant-scoped provider instances. Catalog presence is not the same as a production connector contract.",
    sections: [
      s("What it is", "The Integrations page creates and manages provider connection instances while keeping credential material server-side."),
      s("Connected definition", "The runtime derives Connected only when credentials are present, the provider health evidence is healthy, and a real sync succeeds with lastSuccessfulAt set.", ["Credentials present", "Healthy healthCheck evidence", "Successful sync with lastSuccessfulAt"]),
      s("Contract-backed providers", "The current CONTRACT_IMPLEMENTED_PROVIDERS set contains Genesys Cloud, GitHub, Jira, Slack, Salesforce, ServiceNow and Microsoft 365 / Entra ID. M365 is therefore contract-backed; AWS is not currently in this set."),
      s("How it works", "A registry card, OAuth flow or credential form does not by itself make a provider production-complete. Contract-backed synchronization persists evidence and reconciles entities absent from the latest successful snapshot as stale where supported."),
      s("Step-by-step", "Connect and validate a provider.", [], ["Open Integrations.", "Choose the provider and open its setup guide.", "Complete the real auth/credential flow.", "Wait for the actual connection state.", "Run Sync Now where an implemented sync path exists.", "Confirm health and successful sync evidence before relying on Connected."]),
      s("Common mistakes / integrity notes", "Do not present catalog presence as contract completeness. Unsupported providers must remain explicitly provider_not_implemented."),
    ],
    relatedRoutes: [{label:"Integrations",to:"/integrations"},{label:"How to connect a provider",to:"/help?topic=connect-provider",topic:"connect-provider"}],
  },
  {
    id: "connect-provider",
    title: "How to connect a provider",
    group: "Configuration deep-dives",
    summary: "Choose the provider's real authentication model, complete auth/credential validation, then achieve healthy health + successful sync evidence before calling it Connected.",
    sections: [
      s("Connected definition", "Connected requires server-side credentials, healthy health evidence, and a successful sync with lastSuccessfulAt. Authentication alone is not Connected."),
      s("Authentication models", "Use the actual provider integration form.", ["OAuth: Genesys Cloud, Jira, Slack, Salesforce, ServiceNow, Freshworks, Zendesk, Zoho, HubSpot, GitLab, Confluence, Snowflake, Workday and other providers with OAuth modules.", "GitHub App: install the Aegis GitHub App; do not substitute a personal access token.", "AWS IAM Role: use a role ARN and generated external ID.", "Service account: GCP and Google Workspace use service-account material; auth implementation does not imply a complete production sync contract.", "API key/token: Cohesity, Okta, Datadog, New Relic, PagerDuty and Splunk use provider-specific credential forms."]),
      s("Current contract boundary", "Full read/sync contract: Genesys Cloud, GitHub, Jira, Slack, Salesforce, ServiceNow and Microsoft 365. Auth-implemented but incomplete providers remain outside the contract allow-list. Catalog-only providers must not be expected to become Connected."),
      s("Provider guide index", "Each registry provider has a deep-linked setup topic under Provider setup guides.", ["Use /help?topic=provider-<id> for the provider-specific guide."]),
      s("Step-by-step", "Connect a provider safely.", [], ["Open Integrations.", "Choose the provider and its setup guide.", "Complete authorization/credentials.", "Confirm the real connection status.", "Run Sync Now where available.", "Confirm healthy health evidence and successful sync evidence with lastSuccessfulAt.]),
      s("Common mistakes / integrity notes", "If the production connector returns provider_not_implemented, the provider is not admitted to the contract path. Do not infer Connected from OAuth success or a stored credential."),
    ],
    relatedRoutes: [{label:"Integrations",to:"/integrations"}],
  },
  {
    id: "recommendation-to-change",
    title: "How recommendations become governed changes",
    group: "Configuration deep-dives",
    summary: "Recommendations are advisory until they become a governed change record and complete the execution/verification lifecycle.",
    sections: [
      s("GitHub governed write", "GitHub create-issue is the first real governed write path: approved change record → server-authorized execution → GitHub mutation → provider read-back verification → post-change sync/reconciliation → immutable audit evidence."),
      s("UI stages", "Proposed → Approved / Ready to Execute → Executing → Verified | Failed. Verification Unsupported is reserved for actions where authoritative verification is genuinely impossible."),
      s("Read/sync-only providers", "Jira, Slack, Salesforce, ServiceNow and M365 remain read/sync-only for external mutations unless the implementation changes."),
      s("Step-by-step", "Follow the change path.", [], ["Review recommendation and evidence.", "Create/review the change record.", "Approve according to the configured stage.", "For GitHub create issue, execute only when Ready to Execute.", "Verify the provider's resulting state.", "Review post-change sync and audit evidence.]),
      s("Common mistakes / integrity notes", "Recommendations are not approvals. Approvals are not execution. Execution is not verification."),
    ],
    relatedRoutes: [{label:"Approval Center",to:"/approvals"},{label:"GitHub setup",to:"/help?topic=provider-github",topic:"provider-github"}],
  },
  {
    id: "approval-center",
    title: "Approval Center",
    group: "Core control plane",
    summary: "Approval Center records human authorization. Approval does not prove provider execution or verification.",
    sections: [
      s("GitHub create-issue", "GitHub is the only currently documented external governed write path. It requires an approved persisted change record, server-side authorization, GitHub App execution, read-back verification, post-change sync/reconciliation and immutable audit evidence."),
      s("UI stages", "Proposed → Approved / Ready to Execute → Executing → Verified | Failed. Verification Unsupported is not used for GitHub create-issue."),
      s("Other providers", "Jira, Slack, Salesforce, ServiceNow and M365 remain read/sync-only for external mutations."),
      s("Common mistakes / integrity notes", "Approval is not execution. Execution is not verification."),
    ],
    relatedRoutes: [{label:"Approval Center",to:"/approvals"},{label:"GitHub setup",to:"/help?topic=provider-github",topic:"provider-github"}],
  },
  {
    id: "verification-audit",
    title: "How verification and audit work",
    group: "Configuration deep-dives",
    summary: "Verification confirms resulting provider state; audit records preserve the decision and execution trail.",
    sections: [
      s("GitHub governed verification", "GitHub create-issue verifies the created issue through provider read-back, refreshes provider evidence through post-change sync/reconciliation, and records immutable audit evidence."),
      s("Common integrity rule", "An approval or execution event alone must never be shown as Verified. Verification requires authoritative resulting-state evidence."),
    ],
    relatedRoutes: [{label:"Approval Center",to:"/approvals"},{label:"Audit",to:"/audit"}],
  },
  {
    id: "sync-health-worker",
    title: "Sync, health, and job worker",
    group: "Operations",
    summary: "Health and sync evidence define current provider state; the durable worker is not currently verified as production-deployed.",
    sections: [
      s("Sync evidence", "Generic sync evidence includes status, lastAttemptedAt, lastSuccessfulAt, recordCount and error."),
      s("Manual Sync Now", "Manual Sync Now is the supported operational path without depending on the unverified pg-boss worker deployment."),
      s("Reconciliation", "Successful contract-backed syncs reconcile persisted active entities against the latest provider snapshot and mark missing entities stale where implemented."),
      s("Common mistakes / integrity notes", "A worker file in the repository is not evidence of a deployed durable worker."),
    ],
    relatedRoutes: [{label:"Integrations",to:"/integrations"},{label:"Operational Console",to:"/operational-console"}],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    group: "Operations",
    summary: "Diagnose provider state from connection, health, sync and governance evidence rather than from UI labels alone.",
    sections: [
      s("Common scenarios", "Use these integrity-preserving interpretations.", ["Auth succeeded but status is pending → waiting for health + sync evidence.", "Health is healthy but sync failed → still not Connected.", "provider_not_implemented → provider is not on the production contract path yet.", "Approval exists but GitHub issue not created → check Ready to Execute, governed execution path and audit evidence."]),
      s("Step-by-step", "Use this order.", [], ["Confirm Live vs Demo.", "Confirm tenant/department scope.", "Confirm provider connection state.", "Check health evidence.", "Check last sync and sync error/count.", "Re-run Sync Now or reconnect when appropriate.", "Inspect execution/audit evidence for governed writes.]),
    ],
    relatedRoutes: [{label:"Integrations",to:"/integrations"},{label:"Audit",to:"/audit"}],
  },
];

import { PROVIDER_HELP_TOPICS } from "./provider-guides";

export const HELP_GROUPS = ["Getting started", "Core control plane", "Configuration deep-dives", "Operations", "Provider setup guides"] as const;
export const HELP_TOPICS_WITH_PROVIDERS = [...HELP_TOPICS, ...PROVIDER_HELP_TOPICS];
export const HELP_TOPIC_BY_ID = Object.fromEntries(HELP_TOPICS_WITH_PROVIDERS.map((topic) => [topic.id, topic])) as Record<string, HelpTopic>;
