import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { OPENROUTER_MODELS } from "@/lib/ai/openrouterModels";
import {
  AiConnectionServiceError,
  deleteOpenRouterConnection,
  getAiUserSettings,
  saveOpenRouterConnection
} from "@/lib/ai/userAiConnections";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null) as { apiKey?: unknown; privacyAcknowledged?: unknown } | null;
  const apiKey = normalizeApiKey(body?.apiKey);
  if (!apiKey) return errorResponse("Enter a valid OpenRouter API key.", 400, "ai_openrouter_key_invalid");
  if (body?.privacyAcknowledged !== true) {
    return errorResponse("OpenRouter privacy acknowledgement is required.", 400, "ai_openrouter_consent_required");
  }

  try {
    const previousSettings = await getAiUserSettings(auth.userId);
    const connection = await saveOpenRouterConnection(auth.userId, apiKey);
    return NextResponse.json({
      routeMode: previousSettings.routeMode,
      modelId: previousSettings.modelId,
      connection,
      encryptionConfigured: true,
      models: OPENROUTER_MODELS.map(({ id, key, titleKey }) => ({ id, key, titleKey }))
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof AiConnectionServiceError && error.code === "unavailable") {
      return errorResponse("OpenRouter connection is not configured on this server.", 503, "ai_openrouter_unavailable");
    }
    return errorResponse("OpenRouter key could not be saved.", 503, "ai_openrouter_save_failed");
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  try {
    await deleteOpenRouterConnection(auth.userId);
    const settings = await getAiUserSettings(auth.userId);
    return NextResponse.json({
      routeMode: settings.routeMode,
      modelId: settings.modelId,
      connection: settings.connection,
      encryptionConfigured: settings.encryptionConfigured,
      models: OPENROUTER_MODELS.map(({ id, key, titleKey }) => ({ id, key, titleKey }))
    }, { headers: NO_STORE_HEADERS });
  } catch {
    return errorResponse("OpenRouter connection could not be removed.", 503, "ai_openrouter_delete_failed");
  }
}

async function authenticate(request: NextRequest): Promise<{ userId: string; response?: undefined } | { userId?: undefined; response: NextResponse }> {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) return { response: errorResponse("Authentication is required.", 401, "ai_auth_required") };
    return { userId: user.id };
  } catch {
    return { response: errorResponse("AI settings are temporarily unavailable.", 503, "ai_auth_unavailable") };
  }
}

function normalizeApiKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const apiKey = value.trim();
  return /^sk-or-[A-Za-z0-9._-]{12,500}$/.test(apiKey) ? apiKey : null;
}

function errorResponse(error: string, status: number, code: string) {
  return NextResponse.json({ error, code }, { status, headers: NO_STORE_HEADERS });
}
