import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import {
  decryptAiSecret,
  encryptAiSecret,
  isAiConnectionEncryptionConfigured,
  type EncryptedAiSecret
} from "@/lib/ai/connectionCrypto";
import {
  DEFAULT_OPENROUTER_MODEL,
  isAllowedOpenRouterModel,
  type OpenRouterModelId
} from "@/lib/ai/openrouterModels";

export const AI_BYOK_POLICY_VERSION = "2026-08-01.1";
export const AI_BYOK_CONSENT_SCOPE = "openrouter.byok.chat.general";

export type AiRouteMode = "system" | "byok";

export type AiConnectionSummary = {
  provider: "openrouter";
  status: "active" | "invalid" | "revoked";
  maskedKey: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type AiUserSettings = {
  routeMode: AiRouteMode;
  modelId: OpenRouterModelId;
  connection: AiConnectionSummary | null;
  encryptionConfigured: boolean;
};

export class AiConnectionServiceError extends Error {
  readonly code: "unavailable" | "not_configured" | "invalid";

  constructor(code: "unavailable" | "not_configured" | "invalid") {
    super(code === "not_configured" ? "OpenRouter connection is not configured." : "OpenRouter connection is unavailable.");
    this.name = "AiConnectionServiceError";
    this.code = code;
  }
}

type AiDbResult = {
  data: unknown;
  error: { message?: string } | null;
};

type AiQuery = {
  eq: (column: string, value: string) => AiQuery;
  select: (columns: string) => AiQuery;
  maybeSingle: () => Promise<AiDbResult>;
  error?: { message?: string } | null;
};

type AiTable = {
  select: (columns: string) => AiQuery;
  upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => Promise<AiDbResult>;
  update: (values: Record<string, unknown>) => AiQuery;
  delete: () => AiQuery;
};

type AiServiceClient = {
  from: (table: string) => AiTable;
};

export async function getAiUserSettings(userId: string): Promise<AiUserSettings> {
  const connection = await getConnectionSummary(userId);
  const encryptionConfigured = isAiConnectionEncryptionConfigured();
  let routeMode: AiRouteMode = "system";
  let modelId: OpenRouterModelId = DEFAULT_OPENROUTER_MODEL;

  try {
    const result = await getAiServiceClient()
      .from("ai_user_settings")
      .select("route_mode, model_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!result.error && isRecord(result.data)) {
      if (result.data.route_mode === "system" || result.data.route_mode === "byok") routeMode = result.data.route_mode;
      if (isAllowedOpenRouterModel(result.data.model_id)) modelId = result.data.model_id;
    }
  } catch (error) {
    console.error("AI user settings lookup failed.", getErrorMessage(error));
  }

  return {
    routeMode: routeMode === "byok" && encryptionConfigured && connection?.status === "active" ? "byok" : routeMode,
    modelId,
    connection,
    encryptionConfigured
  };
}

export async function saveOpenRouterConnection(userId: string, apiKey: string): Promise<AiConnectionSummary> {
  let encrypted: EncryptedAiSecret;
  try {
    encrypted = await encryptAiSecret(apiKey);
  } catch (error) {
    console.error("OpenRouter key encryption failed.", getErrorMessage(error));
    throw new AiConnectionServiceError("unavailable");
  }

  const now = new Date().toISOString();
  const client = getAiServiceClient();
  const consentResult = await client.from("ai_consents").upsert({
    user_id: userId,
    scope: AI_BYOK_CONSENT_SCOPE,
    capability: "chat.general",
    provider: "openrouter",
    policy_version: AI_BYOK_POLICY_VERSION,
    acknowledged_at: now,
    revoked_at: null
  }, { onConflict: "user_id,scope" });
  if (consentResult.error) throw new AiConnectionServiceError("unavailable");

  const connectionResult = await client.from("user_ai_connections").upsert({
    user_id: userId,
    provider: "openrouter",
    encrypted_key: encrypted.ciphertext,
    encryption_iv: encrypted.iv,
    key_version: encrypted.keyVersion,
    key_fingerprint: encrypted.fingerprint,
    masked_key: encrypted.masked,
    status: "active",
    updated_at: now,
    revoked_at: null
  }, { onConflict: "user_id,provider" });
  if (connectionResult.error) throw new AiConnectionServiceError("unavailable");

  return {
    provider: "openrouter",
    status: "active",
    maskedKey: encrypted.masked,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null
  };
}

export async function deleteOpenRouterConnection(userId: string): Promise<void> {
  const client = getAiServiceClient();
  const connectionResult = await client
    .from("user_ai_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "openrouter");
  if (connectionResult.error) {
    throw new AiConnectionServiceError("unavailable");
  }

  const consentResult = await client
    .from("ai_consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("scope", AI_BYOK_CONSENT_SCOPE);
  if (consentResult.error) {
    throw new AiConnectionServiceError("unavailable");
  }

  await updateAiUserSettings(userId, "system", DEFAULT_OPENROUTER_MODEL);
}

export async function updateAiUserSettings(userId: string, routeMode: AiRouteMode, modelId: string): Promise<AiUserSettings> {
  if (!isAllowedOpenRouterModel(modelId)) throw new AiConnectionServiceError("unavailable");
  if (routeMode === "byok") {
    const connection = await getConnectionSummary(userId);
    if (!connection || connection.status !== "active") throw new AiConnectionServiceError("not_configured");
  }

  const result = await getAiServiceClient().from("ai_user_settings").upsert({
    user_id: userId,
    route_mode: routeMode,
    model_id: modelId,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (result.error) throw new AiConnectionServiceError("unavailable");
  return getAiUserSettings(userId);
}

export async function getOpenRouterApiKey(userId: string): Promise<{ apiKey: string; connectionId: string }> {
  let result: AiDbResult;
  try {
    result = await getAiServiceClient()
      .from("user_ai_connections")
      .select("id, encrypted_key, encryption_iv, status")
      .eq("user_id", userId)
      .eq("provider", "openrouter")
      .maybeSingle();
  } catch (error) {
    console.error("OpenRouter connection lookup failed.", getErrorMessage(error));
    throw new AiConnectionServiceError("unavailable");
  }

  if (result.error) throw new AiConnectionServiceError("unavailable");
  if (!isRecord(result.data) || result.data.status !== "active") throw new AiConnectionServiceError("not_configured");

  const id = stringValue(result.data.id);
  const encryptedKey = stringValue(result.data.encrypted_key);
  const iv = stringValue(result.data.encryption_iv);
  if (!id || !encryptedKey || !iv) throw new AiConnectionServiceError("invalid");

  try {
    return { apiKey: await decryptAiSecret(encryptedKey, iv), connectionId: id };
  } catch (error) {
    console.error("OpenRouter key decryption failed.", getErrorMessage(error));
    await markConnectionInvalid(userId);
    throw new AiConnectionServiceError("invalid");
  }
}

export async function markOpenRouterConnectionUsed(connectionId: string): Promise<void> {
  try {
    await getAiServiceClient().from("user_ai_connections").update({ last_used_at: new Date().toISOString() }).eq("id", connectionId);
  } catch (error) {
    console.error("OpenRouter connection usage update failed.", getErrorMessage(error));
  }
}

export async function markOpenRouterConnectionInvalid(connectionId: string): Promise<void> {
  try {
    await getAiServiceClient()
      .from("user_ai_connections")
      .update({ status: "invalid", updated_at: new Date().toISOString() })
      .eq("id", connectionId);
  } catch (error) {
    console.error("OpenRouter connection invalid state failed.", getErrorMessage(error));
  }
}

async function getConnectionSummary(userId: string): Promise<AiConnectionSummary | null> {
  try {
    const result = await getAiServiceClient()
      .from("user_ai_connections")
      .select("provider, status, masked_key, created_at, updated_at, last_used_at")
      .eq("user_id", userId)
      .eq("provider", "openrouter")
      .maybeSingle();
    if (result.error || !isRecord(result.data)) return null;

    const provider = result.data.provider;
    const status = result.data.status;
    const maskedKey = stringValue(result.data.masked_key);
    const createdAt = stringValue(result.data.created_at);
    const updatedAt = stringValue(result.data.updated_at);
    if (provider !== "openrouter" || (status !== "active" && status !== "invalid" && status !== "revoked") || !maskedKey || !createdAt || !updatedAt) return null;

    return {
      provider,
      status,
      maskedKey,
      createdAt,
      updatedAt,
      lastUsedAt: result.data.last_used_at === null ? null : stringValue(result.data.last_used_at)
    };
  } catch (error) {
    console.error("AI connection summary lookup failed.", getErrorMessage(error));
    return null;
  }
}

async function markConnectionInvalid(userId: string): Promise<void> {
  try {
    await getAiServiceClient().from("user_ai_connections").update({ status: "invalid", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("provider", "openrouter");
  } catch (error) {
    console.error("AI connection status update failed.", getErrorMessage(error));
  }
}

function getAiServiceClient(): AiServiceClient {
  return createServiceSupabaseClient() as unknown as AiServiceClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
