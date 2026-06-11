import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import {
  confirmMutualConfirmation,
  createTrustAdminClient,
  isInvalidConfirmationStateError,
  isMissingConfirmationError,
  normalizeUuid
} from "@/lib/trust";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(_request: NextRequest, { params }: { params: { confirmationId: string } }) {
  try {
    const { user, error } = await getAuthenticatedUser(_request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const confirmationId = normalizeUuid(params.confirmationId);
    if (!confirmationId) {
      return NextResponse.json({ error: "Invalid confirmation id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const result = await confirmMutualConfirmation(createTrustAdminClient(), confirmationId, user.id);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    if (isMissingConfirmationError(routeError)) {
      return NextResponse.json({ error: "Confirmation request not found." }, { status: 404, headers: NO_STORE_HEADERS });
    }

    if (isInvalidConfirmationStateError(routeError)) {
      return NextResponse.json(
        { error: routeError instanceof Error ? routeError.message : "Confirmation request cannot be confirmed." },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to confirm request." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
