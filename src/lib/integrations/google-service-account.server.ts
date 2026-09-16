import crypto from "node:crypto";

export type GoogleServiceAccount = { clientEmail: string; privateKey: string; projectId?: string };

export async function googleServiceAccountToken(input: { serviceAccount: GoogleServiceAccount; scopes: string[]; subject?: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(JSON.stringify({ iss: input.serviceAccount.clientEmail, scope: input.scopes.join(" "), aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, ...(input.subject ? { sub: input.subject } : {}) })).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(input.serviceAccount.privateKey, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Google service-account authentication failed (${response.status}): ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as any; if (!json.access_token) throw new Error("Google did not return an access token.");
  return { accessToken: json.access_token as string, expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000).toISOString() };
}
