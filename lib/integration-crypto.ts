import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;

function deriveKeyFromEnv(): Buffer {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "INTEGRATIONS_ENCRYPTION_KEY is not set (use 64 hex chars for a 256-bit key, or a long passphrase).",
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  if (raw.length < 32) {
    throw new Error(
      "INTEGRATIONS_ENCRYPTION_KEY must be 64 hex characters or at least 32 characters.",
    );
  }
  return scryptSync(raw, "blueprint-integration-settings-v1", 32);
}

/**
 * AES-256-GCM; output is base64(iv || tag || ciphertext).
 */
export function encryptIntegrationSecret(plain: string): string {
  const key = deriveKeyFromEnv();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptIntegrationSecret(payload: string): string {
  const key = deriveKeyFromEnv();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Invalid ciphertext.");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

export function isIntegrationCryptoConfigured(): boolean {
  try {
    deriveKeyFromEnv();
    return true;
  } catch {
    return false;
  }
}
