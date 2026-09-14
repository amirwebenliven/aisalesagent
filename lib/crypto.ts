import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

// AES-256-GCM. Used for every stored secret: channel credentials, customer
// database connection strings, and tenants' own model API keys.
//
// Format: <iv-hex>:<authTag-hex>:<ciphertext-hex>
// The IV is random per encryption, so encrypting the same value twice gives
// different output — that is intended, and means you cannot compare ciphertexts.

const KEY = Buffer.from(env.ENCRYPTION_KEY, "hex");
const IV_BYTES = 12; // GCM standard

export function encrypt(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), enc.toString("hex")].join(":");
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed ciphertext — expected iv:authTag:data");
  }
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/** Encrypt a JSON-serialisable credential blob. */
export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}

/**
 * Redact a secret for logs. Never log the real value — these are keys to a
 * customer's WhatsApp account and their database.
 */
export function redact(secret: string | null | undefined): string {
  if (!secret) return "(none)";
  return secret.length <= 8 ? "***" : `${secret.slice(0, 4)}…${secret.slice(-2)}`;
}
