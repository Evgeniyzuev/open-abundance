import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { OPENROUTER_MODELS } from "@/lib/ai/openrouterModels";
import {
  AiConnectionServiceError,
  getAiUserSettings,
  updateAiUserSettings,
  type AiRouteMode
} from "@/lib/ai/userAiConnections";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const settings = await getAiUserSettings(auth.userId);
  return NextResponse.json(toResponse(settings), { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null) as { routeMode?: unknown; modelId?: unknown } | null;
  const routeMode = body?.routeMode;
  const modelId = body?.modelId;
  if ((routeMode !== "system" && routeMode !== "byok") || typeof modelId !== "string") {
    return errorResponse("Invalid AI settings.", 400, "ai_settings_invalid");
  }

  try {
    const settings = await updateAiUserSettings(auth.userId, routeMode as AiRouteMode, modelId);
    return NextResponse.json(toResponse(settings), { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof AiConnectionServiceError && error.code === "not_configured") {
      return errorResponse("Connect OpenRouter before selecting My OpenRouter.", 409, "ai_byok_not_configured");
    }
    return errorResponse("AI settings are temporarily unavailable.", 503, "ai_settings_unavailable");
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

function toResponse(settings: Awaited<ReturnType<typeof getAiUserSettings>>) {
  return {
    routeMode: settings.routeMode,
    modelId: settings.modelId,
    connection: settings.connection,
    encryptionConfigured: settings.encryptionConfigured,
    models: OPENROUTER_MODELS.map(({ id, key, titleKey }) => ({ id, key, titleKey }))
  };
}

function errorResponse(error: string, status: number, code: string) {
  return NextResponse.json({ error, code }, { status, headers: NO_STORE_HEADERS });
}
