import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type EncryptedPaymentDetails = {
  encryptedPayload: string;
  encryptionIv: string;
  encryptionTag: string;
  keyVersion: string;
};

export function isPaymentDetailsEncryptionConfigured(): boolean {
  const raw = process.env.P2P_PAYMENT_DETAILS_KEY;
  if (!raw) return false;
  try {
    return Buffer.from(raw, "base64").length === 32;
  } catch {
    return false;
  }
}

function encryptionKey(): Buffer {
  const raw = process.env.P2P_PAYMENT_DETAILS_KEY;
  if (!raw) throw new Error("P2P payment detail encryption is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("P2P_PAYMENT_DETAILS_KEY must be a base64 encoded 32-byte key.");
  return key;
}

export function encryptPaymentDetails(details: Record<string, string>): EncryptedPaymentDetails {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(details), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    encryptedPayload: encrypted.toString("base64"),
    encryptionIv: iv.toString("base64"),
    encryptionTag: cipher.getAuthTag().toString("base64"),
    keyVersion: "v1"
  };
}

export function decryptPaymentDetails(row: {
  encrypted_payload: string;
  encryption_iv: string;
  encryption_tag: string;
}): Record<string, string> {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.encryption_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.encryption_tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_payload, "base64")),
    decipher.final()
  ]).toString("utf8");
  const value = JSON.parse(plaintext) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Stored P2P payment details are invalid.");
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

export function maskPaymentTarget(value: string): string {
  const clean = value.replace(/\s+/g, "");
  if (clean.length <= 4) return "••••";
  return `•••• ${clean.slice(-4)}`;
}
