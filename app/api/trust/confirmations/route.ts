import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import {
  createConfirmation,
  createTrustAdminClient,
  isDuplicatePendingConfirmationError,
  listConfirmations,
  normalizeConfirmationBox,
  normalizeConfirmationType,
  normalizeExpiresInDays,
  normalizeMessage,
  normalizeMetadata,
  normalizeTrustSourceType,
  normalizeUuid
} from "@/lib/trust";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type CreateConfirmationBody = {
  counterpartyUserId?: unknown;
  confirmationType?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  message?: unknown;
  metadata?: unknown;
  expiresInDays?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const box = normalizeConfirmationBox(new URL(request.url).searchParams.get("box"));
    const supabase = createTrustAdminClient();
    const confirmations = await listConfirmations(supabase, user.id, box);
    const profileIds = Array.from(new Set(confirmations.flatMap((item) => [item.requester_user_id, item.counterparty_user_id])));
    const { data: profiles, error: profilesError } = profileIds.length
      ? await supabase
          .from("user_profiles")
          .select("user_id,username,display_name,avatar_url,level,created_at")
          .in("user_id", profileIds)
      : { data: [], error: null };

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ confirmations, profiles: profiles ?? [] }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    if (isMissingTrustSchemaError(routeError)) {
      return NextResponse.json({ confirmations: [], profiles: [], trustUnavailable: true }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load confirmation requests." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function isMissingTrustSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return (
    code === "42P01"
    || code === "PGRST205"
    || message.includes("mutual_confirmations")
    || message.includes("trust_events")
    || message.includes("reciprocity_balances")
  ) && (
    message.includes("does not exist")
    || message.includes("schema cache")
    || message.includes("could not find the table")
  );
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = await readJsonBody(request);
    const counterpartyUserId = normalizeUuid(body.counterpartyUserId);
    const confirmationType = normalizeConfirmationType(body.confirmationType);
    const sourceType = normalizeTrustSourceType(body.sourceType);
    const sourceId = normalizeUuid(body.sourceId);

    if (!counterpartyUserId || counterpartyUserId === user.id) {
      return NextResponse.json({ error: "Invalid counterparty user id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (!confirmationType) {
      return NextResponse.json({ error: "Invalid confirmation type." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const supabase = createTrustAdminClient();
    const { data: targetProfile, error: targetError } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", counterpartyUserId)
      .maybeSingle();

    if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!targetProfile) return NextResponse.json({ error: "Profile not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const confirmation = await createConfirmation(supabase, {
      requesterUserId: user.id,
      counterpartyUserId,
      confirmationType,
      sourceType,
      sourceId,
      message: normalizeMessage(body.message),
      metadata: normalizeMetadata(body.metadata),
      expiresInDays: normalizeExpiresInDays(body.expiresInDays)
    });

    return NextResponse.json({ confirmation }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    if (isDuplicatePendingConfirmationError(routeError)) {
      return NextResponse.json(
        { error: "A pending confirmation already exists for this source." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create confirmation request." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function readJsonBody(request: NextRequest): Promise<CreateConfirmationBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}
