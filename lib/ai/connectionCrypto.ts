const KEY_VERSION = "v1";
const IV_LENGTH = 12;
const MASTER_KEY_BYTES = 32;

export type EncryptedAiSecret = {
  ciphertext: string;
  iv: string;
  fingerprint: string;
  masked: string;
  keyVersion: string;
};

export class AiConnectionCryptoError extends Error {
  constructor(message = "AI connection encryption is unavailable.") {
    super(message);
    this.name = "AiConnectionCryptoError";
  }
}

export function isAiConnectionEncryptionConfigured(): boolean {
  return Boolean(process.env.AI_CONNECTION_ENCRYPTION_KEY?.trim());
}

export async function encryptAiSecret(secret: string): Promise<EncryptedAiSecret> {
  const key = await importMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );
  const digest = await crypto.subtle.digest("SHA-256", plaintext);

  return {
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    iv: encodeBase64Url(iv),
    fingerprint: encodeBase64Url(new Uint8Array(digest)).slice(0, 16),
    masked: maskSecret(secret),
    keyVersion: KEY_VERSION
  };
}

export async function decryptAiSecret(ciphertext: string, iv: string): Promise<string> {
  const key = await importMasterKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(iv).buffer as ArrayBuffer },
    key,
    decodeBase64Url(ciphertext).buffer as ArrayBuffer
  );
  return new TextDecoder().decode(plaintext);
}

async function importMasterKey(): Promise<CryptoKey> {
  const encoded = process.env.AI_CONNECTION_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new AiConnectionCryptoError();

  let raw: Uint8Array;
  try {
    raw = decodeBase64Url(encoded);
  } catch {
    throw new AiConnectionCryptoError("AI connection encryption key is invalid.");
  }
  if (raw.byteLength !== MASTER_KEY_BYTES) {
    throw new AiConnectionCryptoError("AI connection encryption key must contain 32 bytes.");
  }

  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function maskSecret(secret: string): string {
  const prefix = secret.slice(0, Math.min(9, secret.length));
  const suffix = secret.slice(-4);
  return `${prefix}****${suffix}`;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
