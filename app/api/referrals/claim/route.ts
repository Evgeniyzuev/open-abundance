import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

type ClaimBody = {
  referralCode?: unknown;
  guestId?: unknown;
  capturedAt?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const body = await readJsonBody(request);
    const referralCode = normalizeReferralCode(body.referralCode);
    const guestId = normalizeUuid(body.guestId);
    const capturedAt = normalizeDate(body.capturedAt);
    const { data: assignmentRows, error: assignmentError } = await supabase.rpc("claim_referral_and_assign_team", {
      p_member_user_id: user.id,
      p_referral_code: referralCode ?? undefined,
      p_guest_id: guestId ?? undefined,
      p_captured_at: capturedAt ?? undefined
    });

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 });
    }

    const [assignment] = assignmentRows ?? [];
    if (!assignment) {
      return NextResponse.json({ error: "Team assignment returned no result." }, { status: 500 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("team_memberships")
      .select("*")
      .eq("member_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    return NextResponse.json({
      status: assignment.assignment_status,
      source: assignment.assignment_source,
      queueReason: assignment.queue_reason,
      membership
    });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to claim referral." },
      { status: 500 }
    );
  }
}

async function readJsonBody(request: NextRequest): Promise<ClaimBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeReferralCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{4,32}$/.test(trimmed) ? trimmed : undefined;
}

function normalizeUuid(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}
