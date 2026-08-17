// Client-safe structured error codes for the Genesys integration.
// Server code throws IntegrationError; server functions return the code and a
// safe message. Raw provider payloads are logged server-side only.

export type IntegrationErrorCode =
  | "not_configured"
  | "oauth_failed"
  | "oauth_state_invalid"
  | "invalid_client"
  | "token_expired"
  | "connection_revoked"
  | "insufficient_scopes"
  | "rate_limited"
  | "org_not_found"
  | "provider_error"
  | "not_connected"
  | "forbidden"
  | "no_tenant";

export const ERROR_MESSAGES: Record<IntegrationErrorCode, string> = {
  not_configured:
    "Genesys OAuth credentials are not configured for this deployment yet. Add GENESYS_CLIENT_ID and GENESYS_CLIENT_SECRET in backend secrets.",
  oauth_failed: "Genesys did not complete the authorization. Please try connecting again.",
  oauth_state_invalid: "This authorization link is invalid or has expired. Start the connection again.",
  invalid_client: "The configured Genesys OAuth client ID or secret was rejected by Genesys.",
  token_expired: "The Genesys session expired and could not be refreshed. Reconnect the integration.",
  connection_revoked: "Access was revoked in Genesys. Reconnect to restore the integration.",
  insufficient_scopes:
    "The Genesys OAuth client is missing required read-only scopes. Update the client and reconnect.",
  rate_limited: "Genesys rate limit reached. Wait a moment and retry the sync.",
  org_not_found: "No Genesys organization could be resolved for these credentials.",
  provider_error: "The Genesys API returned an unexpected error. The sync was not completed.",
  not_connected: "Genesys is not connected for this workspace yet.",
  forbidden: "Only workspace admins and managers can manage integrations.",
  no_tenant: "Your account is not attached to a workspace yet.",
};

export class IntegrationError extends Error {
  code: IntegrationErrorCode;
  detail?: string;
  status?: number;

  constructor(code: IntegrationErrorCode, detail?: string, status?: number) {
    super(ERROR_MESSAGES[code]);
    this.name = "IntegrationError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
    if (status !== undefined) this.status = status;
  }
}

export function toErrorCode(error: unknown): IntegrationErrorCode {
  return error instanceof IntegrationError ? error.code : "provider_error";
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof IntegrationError) {
    if (error.detail) {
      return `${error.message} Details: ${error.detail}`;
    }

    return error.message;
  }

  return ERROR_MESSAGES.provider_error;
}

/**
 * Read-only scopes requested for the Genesys integration.
 * Coverage of the endpoints the connector calls:
 *  - GET /api/v2/organizations/me  -> organization:readonly
 *  - GET /api/v2/users/me          -> users:readonly
 *  - GET /api/v2/users?expand=presence,division,authorization
 *                                  -> users:readonly + presence:readonly + authorization:readonly
 *  - GET /api/v2/license/users     -> license:readonly
 *  - GET /api/v2/license/definitions -> license:readonly
 *  - GET /api/v2/routing/queues    -> routing:readonly
 *  - (future) analytics queries    -> analytics:readonly
 * Every scope is a :readonly grant; the connector issues no write calls.
 */
export const GENESYS_SCOPES = [
  "organization:readonly",
  "users:readonly",
  "license:readonly",
  "routing:readonly",
  "authorization:readonly",
  "presence:readonly",
  "analytics:readonly",
] as const;

/** Supported Genesys Cloud regions (login/API host suffixes). */
export const GENESYS_REGIONS = [
  { id: "mypurecloud.com", label: "US East (Virginia)" },
  { id: "usw2.pure.cloud", label: "US West (Oregon)" },
  { id: "cac1.pure.cloud", label: "Canada (Central)" },
  { id: "mypurecloud.ie", label: "EU West (Ireland)" },
  { id: "mypurecloud.de", label: "EU Central (Frankfurt)" },
  { id: "euw2.pure.cloud", label: "EU West (London)" },
  { id: "aps1.pure.cloud", label: "Asia Pacific (Mumbai)" },
  { id: "apne2.pure.cloud", label: "Asia Pacific (Seoul)" },
  { id: "mypurecloud.jp", label: "Asia Pacific (Tokyo)" },
  { id: "mypurecloud.com.au", label: "Asia Pacific (Sydney)" },
  { id: "sae1.pure.cloud", label: "South America (São Paulo)" },
] as const;

export const DEFAULT_GENESYS_REGION = "mypurecloud.com";

/**
 * SSRF guard. A region is only ever a host suffix from the fixed allow-list
 * above, so no caller-supplied value can redirect an outbound OAuth token
 * request (which carries the platform Genesys client secret) to another host.
 * Anything unrecognised — including a stored value from an older row — falls
 * back to the default region.
 */
export function isSupportedGenesysRegion(regionId: unknown): boolean {
  return typeof regionId === "string" && GENESYS_REGIONS.some((r) => r.id === regionId.trim().toLowerCase());
}

/** Normalizes untrusted input to an allow-listed region host suffix. */
export function normalizeGenesysRegion(regionId: unknown): string {
  if (typeof regionId !== "string") return DEFAULT_GENESYS_REGION;
  const candidate = regionId.trim().toLowerCase();
  return isSupportedGenesysRegion(candidate) ? candidate : DEFAULT_GENESYS_REGION;
}
