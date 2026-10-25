import { NextRequest, NextResponse } from "next/server";
import { isQaUser } from "@/lib/qaAccounts";
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
    // A QA test account joins no real leader's team (lib/qaAccounts.ts).
    if (isQaUser(user.id)) return NextResponse.json({ status: "qa_account", membership: null });

    const body = await readJsonBody(request);
    const rawCode = typeof body.referralCode === "string" ? body.referralCode.trim() : "";
    const referralCode = rawCode.startsWith("@")
      ? await resolveNicknameReferral(supabase, rawCode)
      : normalizeReferralCode(body.referralCode);
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

/** `?ref=@nickname` is an alias for that person's active referral code; unknown names give no code. */
async function resolveNicknameReferral(supabase: any, alias: string): Promise<string | undefined> {
  const name = alias.replace(/^@+/, "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9]{4,23}$/.test(name)) return undefined;
  const { data: owner } = await supabase.from("user_profiles").select("user_id").eq("username", name).is("deleted_at", null).maybeSingle();
  if (!owner?.user_id) return undefined;
  const { data: code } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("user_id", owner.user_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof code?.code === "string" ? code.code : undefined;
}
