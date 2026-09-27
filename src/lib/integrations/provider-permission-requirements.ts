export interface ProviderPermissionRequirement {
  heading: string;
  body: string;
  items: string[];
  notes?: string[];
  sourceLabel?: string;
}

export const PROVIDER_PERMISSION_REQUIREMENTS: Record<string, ProviderPermissionRequirement> = {
  genesys: {
    heading: "Exact Genesys Cloud permissions",
    body: "Create the OAuth client with these read-only OAuth roles/scopes. Do not grant write or administrator roles for the CenOps integration.",
    items: [
      "organization:readonly",
      "users:readonly",
      "license:readonly",
      "routing:readonly",
      "analytics:readonly",
    ],
    notes: [
      "These are Genesys Cloud OAuth scopes, not Genesys user roles. The OAuth client must be created with Client Credentials.",
      "The scopes map directly to the CenOps registry: organization, users, license, routing and analytics read access.",
    ],
  },
  aws: {
    heading: "Exact AWS IAM permissions",
    body: "Create the cross-account IAM role used by CenOps and attach the AWS managed policies below. Keep the trust policy restricted to the CenOps AWS principal and the generated external ID.",
    items: [
      "AWS managed policy: arn:aws:iam::aws:policy/ReadOnlyAccess",
      "AWS managed policy: arn:aws:iam::aws:policy/AWSBillingReadOnlyAccess",
      "Trust policy: sts:AssumeRole for the CenOps AWS principal, constrained by the CenOps-generated sts:ExternalId",
    ],
    notes: [
      "ReadOnlyAccess covers read-only resource inventory across AWS services; AWSBillingReadOnlyAccess supplies read-only Billing/Cost Management access.",
      "CenOps does not require iam:PassRole, iam:CreateRole, iam:AttachRolePolicy, or other administrative IAM permissions on the target account.",
    ],
  },
  azure: {
    heading: "Exact Microsoft Azure permissions",
    body: "For the Azure management data used by CenOps, assign these Azure RBAC roles to the Entra application's service principal at the subscription scope.",
    items: [
      "Reader — subscription scope",
      "Cost Management Reader — subscription or billing scope used for cost data",
      "Security Reader — subscription scope if Defender for Cloud security findings are enabled for the tenant",
    ],
    notes: [
      "Do not grant Owner, Contributor, User Access Administrator, or other write/admin roles.",
      "The Entra application also uses Microsoft identity platform client-credentials authentication; Azure RBAC is what controls management-plane resource access.",
    ],
  },
  gcp: {
    heading: "Exact Google Cloud IAM roles",
    body: "Grant the CenOps service account the following Google Cloud predefined roles on the target project.",
    items: [
      "Viewer — roles/viewer",
      "Billing Account Viewer — roles/billing.viewer, on the Cloud Billing account used by the project",
    ],
    notes: [
      "roles/viewer supplies read-only project resource inventory. roles/billing.viewer supplies billing-account cost and pricing visibility.",
      "Do not grant Editor, Owner, Service Account Admin, Service Account User, or Project IAM Admin unless your own organization requires them for credential administration; CenOps itself does not need those permissions.",
      "The service account uses the cloud-platform OAuth scope; IAM roles remain the actual authorization boundary.",
    ],
  },
  m365: {
    heading: "Exact Microsoft Graph application permissions",
    body: "In Microsoft Entra ID → App registrations → API permissions → Microsoft Graph → Application permissions, add exactly these permissions and grant admin consent.",
    items: [
      "User.Read.All",
      "LicenseAssignment.Read.All",
    ],
    notes: [
      "These permissions cover the current CenOps M365 contract for users, subscribed SKUs and license assignments.",
      "Do not add User.ReadWrite.All, Directory.ReadWrite.All, Group.ReadWrite.All, or other write permissions for the current read/sync integration.",
    ],
  },
  "google-workspace": {
    heading: "Exact Google Workspace delegated scopes",
    body: "In Google Workspace Admin → Security → Access and data control → API Controls → Domain-wide delegation, authorize the CenOps service account client ID with these read-only Admin SDK scopes.",
    items: [
      "https://www.googleapis.com/auth/admin.directory.user.readonly",
      "https://www.googleapis.com/auth/admin.directory.group.readonly",
    ],
    notes: [
      "The delegated administrator account entered in CenOps must be allowed to read the requested directory data.",
      "Do not authorize admin.directory.user, admin.directory.group, role-management, user-security, or other write/admin scopes for the current CenOps directory sync.",
    ],
  },
  jira: {
    heading: "Exact Jira OAuth 2.0 scopes",
    body: "In the Atlassian developer console, configure the Jira OAuth 2.0 (3LO) app with these classic scopes.",
    items: [
      "read:jira-work — read Jira projects and issue data",
      "write:jira-work — create/edit issues and comments required by the current CenOps Jira write capability",
    ],
    notes: [
      "Atlassian Jira project permissions still apply to the authorizing user; OAuth scopes do not override Jira project permissions.",
      "The current CenOps registry intentionally uses these two scopes. Do not add manage:jira-project, manage:jira-configuration, or manage:jira-webhook unless the product contract is expanded.",
    ],
  },
  servicenow: {
    heading: "Exact ServiceNow roles",
    body: "Create a dedicated ServiceNow integration user and assign the roles required by the current Incidents/Changes/Problems/CMDB integration path.",
    items: [
      "snc_platform_rest_api_access — Platform REST API access",
      "itil — access to standard ITSM incident/change/problem data used by the integration",
      "cmdb_read — read-only CMDB access",
      "snc_read_only — safety role that restricts accessible tables to read-only behavior",
    ],
    notes: [
      "If your CenOps tenant only uses incidents and does not use CMDB evidence, cmdb_read can be omitted.",
      "Do not grant admin. The current read/sync contract does not require administrative ServiceNow access.",
      "For future write actions, separate write roles such as sn_incident_write or sn_change_write must be added only when a governed action explicitly requires them.",
    ],
  },
  freshworks: {
    heading: "Exact Freshservice OAuth scopes",
    body: "Configure the Freshservice OAuth application with the exact scopes currently declared by CenOps.",
    items: [
      "freshservice.tickets.view",
      "freshservice.tickets.edit",
      "freshservice.tickets.conversations.create",
    ],
    notes: [
      "These are Freshservice OAuth permission scopes, not a generic administrator role.",
      "If the deployed connector reads assets or additional Freshservice resources, those resource-specific scopes must be added to the connector contract before they are documented as required.",
    ],
  },
  zendesk: {
    heading: "Exact Zendesk OAuth scopes",
    body: "Configure the Zendesk OAuth client with resource-specific scopes for the current ticket/user integration.",
    items: [
      "tickets:read",
      "users:read",
      "organizations:read",
    ],
    notes: [
      "Do not use the broad read or read write scope when the resource-specific scopes above are sufficient.",
      "The Zendesk user who authorizes the OAuth client must itself have access to the requested resources.",
    ],
  },
  salesforce: {
    heading: "Exact Salesforce integration permissions",
    body: "Use a dedicated Salesforce integration user with API access and the OAuth API scope used by the CenOps connected application.",
    items: [
      "OAuth scope: api",
      "User permission: API Enabled",
      "Object permissions: Read on Account, Opportunity and Case objects used by the current CenOps sync",
      "Field-level security: Read access to the fields CenOps is expected to ingest",
    ],
    notes: [
      "Salesforce does not have a single universal read-only role that replaces object and field permissions. The integration user’s profile/permission sets and sharing rules determine the records actually visible to the API.",
      "Do not grant Modify All Data, View All Data, Author Apex, or other broad administrator permissions for the current read/sync connector.",
    ],
  },
  zoho: {
    heading: "Exact Zoho CRM OAuth scopes",
    body: "Configure the Zoho CRM server-based OAuth application with these read-only scopes.",
    items: [
      "ZohoCRM.modules.READ",
      "ZohoCRM.settings.READ",
      "ZohoCRM.users.READ",
    ],
    notes: [
      "Use the Accounts URL for the Zoho data center where the CRM organization resides.",
      "Do not add ZohoCRM.modules.ALL or ZohoCRM.settings.ALL for the current CenOps read/sync contract.",
    ],
  },
  hubspot: {
    heading: "Exact HubSpot OAuth scopes",
    body: "Configure the HubSpot app with read scopes for the CRM objects used by CenOps. HubSpot uses object-specific scopes rather than a single universal read role.",
    items: [
      "crm.objects.contacts.read",
      "crm.objects.companies.read",
      "crm.objects.deals.read",
      "crm.objects.tickets.read",
      "crm.schemas.contacts.read",
      "crm.schemas.companies.read",
      "crm.schemas.deals.read",
      "crm.schemas.tickets.read",
    ],
    notes: [
      "If the deployed CenOps connector does not call one of these object or schema APIs, that scope should be removed rather than granted by default.",
      "Do not use broad legacy ecommerce or write scopes for the current read/sync path.",
    ],
  },
  slack: {
    heading: "Exact Slack bot OAuth scopes",
    body: "Configure the Slack app with the following read-only bot scopes for workspace, channel and message evidence.",
    items: [
      "channels:read",
      "channels:history",
      "groups:read",
      "groups:history",
      "users:read",
      "team:read",
    ],
    notes: [
      "channels:history and groups:history allow the app to read message history only in conversations where the app has access.",
      "Do not grant channels:manage, groups:write, chat:write, users:write, admin:* or other mutation/admin scopes for the current CenOps read/sync contract.",
    ],
  },
  github: {
    heading: "Exact GitHub App permissions",
    body: "Install the CenOps GitHub App and grant only the repository/organization permissions requested by the app. The integration uses a GitHub App installation, not a personal access token.",
    items: [
      "Repository metadata: Read-only",
      "Repository contents: Read-only",
      "Actions: Read-only",
      "Issues: Read & write only if the governed Create Issue action is enabled",
      "Security events: Read-only where the installed CenOps security evidence path uses them",
    ],
    notes: [
      "During installation, select only the repositories CenOps should access.",
      "GitHub App permissions are endpoint-specific; GitHub exposes the required permission in the X-Accepted-GitHub-Permissions response header when an endpoint is denied.",
    ],
  },
  gitlab: {
    heading: "Exact GitLab OAuth scopes",
    body: "Configure the GitLab OAuth application with read-only API scopes for the current project/pipeline/security evidence path.",
    items: [
      "read_api — read access to the GitLab API",
      "read_user — read-only authenticated user/profile information",
    ],
    notes: [
      "Do not use api for the current read/sync connector because api grants complete read/write API access.",
      "GitLab group/project membership and resource-level permissions still limit what the authorized identity can see.",
    ],
  },
  confluence: {
    heading: "Exact Confluence OAuth scopes",
    body: "Configure the Atlassian OAuth 2.0 application with the current Confluence read scopes.",
    items: [
      "read:confluence-content.all",
      "read:confluence-space.summary",
      "read:confluence-user",
      "offline_access",
    ],
    notes: [
      "These scopes provide read access and refresh-token capability for the current sync flow. Do not add write:confluence-content or administrative scopes.",
    ],
  },
  rubrik: {
    heading: "Exact Rubrik Security Cloud access",
    body: "Create a dedicated RSC service account and assign a read-only role that contains the permissions required by the CenOps RSC API queries.",
    items: [
      "Service account authentication: OAuth 2.0 client_credentials",
      "Role: a custom RSC role containing only the read permissions for the Rubrik objects queried by CenOps",
      "Permission types required: OBJECT/FIELD read permissions for the queried objects and fields",
    ],
    notes: [
      "Rubrik service accounts use roles for RBAC; Rubrik does not define one universal 'CenOps read-only' role name across all RSC environments.",
      "Do not assign a broad administrative role. The exact object/field permissions should match the queries exposed by the deployed CenOps Rubrik connector.",
    ],
  },
  veeam: {
    heading: "Exact Veeam Service Provider Console access",
    body: "The current Veeam connector uses the Service Provider Console REST API credential flow. Create a dedicated API-capable account and use a Simple API Key where the deployed connector supports it.",
    items: [
      "API authentication: Simple API Key for Veeam Service Provider Console REST API",
      "Required VSPC role: Portal Administrator to generate/configure the Simple API Key",
      "Runtime account permissions: read access to the tenants/jobs/sessions/resources that CenOps is expected to synchronize",
    ],
    notes: [
      "Veeam permissions are deployment- and service-provider-specific. Portal Administrator is required to create the API key, but the API key should be used only for the API surface and data scope required by the CenOps connector.",
      "Do not grant additional job/policy management privileges unless the connector is explicitly expanded to perform those actions.",
    ],
  },
  cohesity: {
    heading: "Exact Cohesity API access",
    body: "Create an API key in the Cohesity management/API surface with read-only access to the resources queried by CenOps.",
    items: [
      "Authentication: API key",
      "Permission level: read-only for backup, recovery, cluster/storage and protection objects used by the connector",
    ],
    notes: [
      "Cohesity permission names vary between Helios/DataHawk/cluster API surfaces and software versions. The deployed connector must use the provider's read-only role/profile that covers the exact API resources it calls; do not grant administrator/write access just to make authentication succeed.",
    ],
  },
  crowdstrike: {
    heading: "Exact CrowdStrike Falcon API scopes",
    body: "In Falcon → Support → API Clients and Keys, create the API client with read scopes matching the CenOps evidence modules.",
    items: [
      "Hosts: READ (devices:read)",
      "Detections: READ",
      "Incidents: READ",
      "Vulnerabilities / exposure evidence: READ where enabled by the deployed connector",
    ],
    notes: [
      "CrowdStrike scopes are product/API-collection specific. Grant READ only for the Falcon modules actually queried by CenOps.",
      "Do not grant WRITE scopes such as Hosts WRITE or Incident WRITE for the current read/sync connector.",
    ],
  },
  "microsoft-defender": {
    heading: "Exact Microsoft Defender for Endpoint application permissions",
    body: "In Microsoft Entra ID, open the app registration → API permissions → APIs my organization uses → WindowsDefenderATP → Application permissions, then grant admin consent.",
    items: [
      "Alert.Read.All — Read all alerts",
      "AdvancedQuery.Read.All — Run advanced queries",
    ],
    notes: [
      "These match the current CenOps Defender registry contract.",
      "Do not add Alert.ReadWrite.All, Machine.Isolate, Machine.RestrictExecution, or other action permissions unless a future governed remediation explicitly requires them.",
    ],
  },
  okta: {
    heading: "Exact Okta API access",
    body: "Create the SSWS API token from a dedicated Okta service account and make the token inherit only the administrator role required by the current CenOps read/sync endpoints.",
    items: [
      "Authentication scheme: SSWS API token",
      "Minimum baseline role for directory/security read operations: Read-Only Administrator where the queried endpoints are covered",
      "Use a custom admin role with only the required read permissions when the standard Read-Only Administrator is broader than necessary",
    ],
    notes: [
      "Okta API tokens inherit the privilege level of the admin account that creates them. Do not create the token from a Super Administrator account unless the queried APIs genuinely require it.",
      "For endpoint-specific OAuth alternatives, use scoped OAuth permissions instead of broad SSWS privileges when the connector supports that model.",
    ],
  },
  datadog: {
    heading: "Exact Datadog key access",
    body: "Create a Datadog API key for authentication and an application key with read permissions for the APIs CenOps queries.",
    items: [
      "API Key — required for Datadog API authentication",
      "Application Key — required for read/query APIs used by CenOps",
      "Application-key permissions: read-only for metrics, monitors, logs and service-health endpoints used by the connector",
    ],
    notes: [
      "Datadog application keys now support granular permissions in organizations where that feature is enabled. Do not grant write permissions for the current read/sync integration.",
    ],
  },
  newrelic: {
    heading: "Exact New Relic access",
    body: "Create a New Relic user key for the service identity used by CenOps and give that identity read access to the accounts and entities it needs to query through NerdGraph/REST APIs.",
    items: [
      "Authentication: User API key (user key), not a license/ingest key",
      "Account access: read access to the target New Relic accounts",
      "Role permissions: read access to the telemetry, alerts and infrastructure features queried by the CenOps connector",
    ],
    notes: [
      "New Relic user keys inherit the access of the user they belong to. A user key is not itself a replacement for account/role permissions.",
      "Do not use a license key for CenOps API queries; license keys are intended for telemetry ingest.",
    ],
  },
  splunk: {
    heading: "Exact Splunk token access",
    body: "Create a Splunk platform bearer token for a dedicated integration user and assign only the capabilities required by the REST endpoints used by CenOps.",
    items: [
      "Authentication: Splunk bearer token",
      "User role: a custom read-only role containing the search/index/data permissions required by the CenOps queries",
      "Required REST capability: permission to execute the searches and read the indexes queried by CenOps",
    ],
    notes: [
      "Splunk capabilities are role-based and vary with the indexes and APIs exposed by the deployment. Do not grant admin or edit_* capabilities for the current read/sync path.",
    ],
  },
  pagerduty: {
    heading: "Exact PagerDuty API access",
    body: "Create a dedicated PagerDuty REST API key for CenOps and use a read-only account/API-key context for incident, service and on-call data.",
    items: [
      "Authentication: REST API key",
      "Access: read permission for incidents, services, escalation policies, schedules and on-call resources used by the CenOps connector",
    ],
    notes: [
      "PagerDuty API access is also constrained by the user/account permissions associated with the API key. Do not use an account with administrative write privileges for a read/sync integration.",
    ],
  },
  workday: {
    heading: "Exact Workday security requirements",
    body: "Workday does not use a universal OAuth scope that grants access to all HR data. Create a dedicated Integration System User/security group and explicitly grant the security domains needed by the CenOps worker/organization/lifecycle APIs.",
    items: [
      "Integration System User (ISU) — dedicated non-human integration identity",
      "Integration System Security Group — dedicated security group for the CenOps integration",
      "Domain security policies: View access to the worker, organization and lifecycle domains exposed by the deployed CenOps connector",
      "Business Process Security: View access only where the selected Workday API requires it",
    ],
    notes: [
      "The exact Workday domain names depend on the tenant/API implementation. CenOps should document the concrete domains from the deployed connector before the tenant is marked production-ready rather than inventing a universal Workday role.",
      "Do not grant Modify/Cancel business-process permissions for the current read/sync connector.",
    ],
  },
  sap: {
    heading: "Exact SAP authorization",
    body: "SAP authorization is product/API-runtime specific. Configure the OAuth client or BTP service binding for the exact SAP API that CenOps connects to, then grant the API's read role/scope.",
    items: [
      "OAuth client/service binding: confidential client",
      "API authorization: the exact read scope exposed by the selected SAP API",
      "SAP backend authorization: read-only authorization for the API service/communication arrangement used by CenOps",
    ],
    notes: [
      "There is no single SAP-wide role that is correct for all SAP products. Do not document a generic SAP_ADMIN or broad role as a CenOps prerequisite.",
      "The final setup guide should display the exact scope/role from the selected SAP product's service binding when a concrete API target is chosen.",
    ],
  },
  oracle: {
    heading: "Exact Oracle authorization",
    body: "Use a dedicated Oracle identity-domain confidential application and grant only the API scopes/roles required by the Oracle service exposed to CenOps.",
    items: [
      "Confidential OAuth application in the target Oracle Identity Domain",
      "OAuth scope: the exact read scope exposed by the selected Oracle REST API",
      "Oracle IAM/API role: read-only access to the resources queried by CenOps",
    ],
    notes: [
      "Oracle Cloud applications and OCI APIs use different authorization models. The exact role is therefore tied to the selected API rather than a universal Oracle role.",
      "Do not grant tenancy administrator or resource-manager write privileges for the current read/sync integration.",
    ],
  },
  snowflake: {
    heading: "Exact Snowflake OAuth role and scope",
    body: "Create the account-specific Snowflake OAuth security integration and bind the OAuth token to a read-only Snowflake role.",
    items: [
      "Snowflake session role: PUBLIC (scope session:role:PUBLIC) for the current registry configuration",
      "The PUBLIC role must have USAGE on the databases/schemas and SELECT on the tables/views that CenOps reads",
      "OAuth security integration: allow the CenOps OAuth client and require PKCE where supported",
    ],
    notes: [
      "If the PUBLIC role is too broad or insufficient for your data model, create a dedicated read-only role such as CENOPS_READER, grant it only USAGE/SELECT, and use scope session:role:CENOPS_READER instead.",
      "Do not grant ACCOUNTADMIN, SECURITYADMIN, ORGADMIN or unrestricted role switching.",
    ],
  },
  mongodb: {
    heading: "Exact MongoDB Atlas service-account roles",
    body: "Create a dedicated Atlas service account and grant it only project-level read access to the projects CenOps will monitor.",
    items: [
      "Project Read Only — GROUP_READ_ONLY, on each monitored Atlas project",
    ],
    notes: [
      "Project Read Only provides view-only project control-plane metadata, activity, operational data, users/roles and cluster metrics without granting Data Explorer or administrative access.",
      "Do not grant Project Owner, Project Access Manager, Project Data Access Read/Write, Backup Manager or Organization Owner for the current Atlas control-plane read/sync integration.",
    ],
  },
};

export function getProviderPermissionRequirement(providerId: string): ProviderPermissionRequirement | undefined {
  return PROVIDER_PERMISSION_REQUIREMENTS[providerId];
}
