import crypto from "node:crypto";

function encryptionKey(): Buffer {
  const keyHex = process.env.AEGIS_CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("AEGIS_CREDENTIAL_ENCRYPTION_KEY is not configured on the server.");
  }
  return Buffer.from(keyHex, "hex");
}

export function encryptCredentials(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCredentials<T>(value: string): T {
  const [ivRaw, tagRaw, ciphertextRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Stored integration credentials are malformed.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8")) as T;
}


export interface CredentialKeyProvider {
  currentKeyId(): Promise<string>;
  keyFor(keyId: string): Promise<Buffer>;
}

export async function credentialEnvelopeMetadata(value: string): Promise<{ keyId: string; algorithm: "aes-256-gcm" }> {
  const keyId = process.env.AEGIS_CREDENTIAL_KEY_ID?.trim() || "legacy-static-v1";
  return { keyId, algorithm: "aes-256-gcm" };
}

export function assertCredentialKeyLifecycleConfigured(): void {
  const keyId = process.env.AEGIS_CREDENTIAL_KEY_ID?.trim();
  const keySource = process.env.AEGIS_CREDENTIAL_KEY_PROVIDER?.trim();
  if (!keyId || !keySource) {
    throw new Error("Managed credential key lifecycle is not configured. Set AEGIS_CREDENTIAL_KEY_ID and AEGIS_CREDENTIAL_KEY_PROVIDER before production key rotation.");
  }
}
