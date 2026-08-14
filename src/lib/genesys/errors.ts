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
  oauth_state_invalid:
    "This authorization link is invalid or has expired. Start the connection again.",
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
  return error instanceof IntegrationError ? error.message : ERROR_MESSAGES.provider_error;
}

/** Read-only scopes requested for the first Genesys vertical slice. */
export const GENESYS_SCOPES = [
  "organization:readonly",
  "users:readonly",
  "license:readonly",
  "routing:readonly",
  "authorization:readonly",
  "presence:readonly",
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
