import { NextRequest, NextResponse } from "next/server";
import { cleanTags, NEED_TAGS, OFFER_TAGS } from "@/lib/helpTags";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET/PUT /api/help-profile
 *
 * The participant's own "can help / need help" tags and the explicit consent to use them for
 * matching. Tags come from a fixed vocabulary. Rows are read and written only here, with the
 * service role, filtered by the authenticated user id.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const db = supabase as any;

  const { data, error: readError } = await db
    .from("user_help_profiles")
    .select("offers,needs,match_consent")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: "Could not load." }, { status: 500, headers: NO_STORE_HEADERS });

  return NextResponse.json(
    { offers: data?.offers ?? [], needs: data?.needs ?? [], matchConsent: Boolean(data?.match_consent) },
    { headers: NO_STORE_HEADERS }
  );
}

export async function PUT(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400, headers: NO_STORE_HEADERS });

  const offers = cleanTags(body.offers, OFFER_TAGS);
  const needs = cleanTags(body.needs, NEED_TAGS);
  const matchConsent = body.matchConsent === true;

  const db = supabase as any;

  const { data: existing } = await db
    .from("user_help_profiles")
    .select("match_consent")
    .eq("user_id", user.id)
    .maybeSingle();
  const consentChanged = Boolean(existing?.match_consent) !== matchConsent;

  const now = new Date().toISOString();
  const { error: writeError } = await db.from("user_help_profiles").upsert({
    user_id: user.id,
    offers,
    needs,
    match_consent: matchConsent,
    ...(consentChanged || !existing ? { consent_updated_at: now } : {}),
    updated_at: now
  });
  if (writeError) return NextResponse.json({ error: "Could not save." }, { status: 500, headers: NO_STORE_HEADERS });

  // Counts only: the event never carries which tags were chosen beyond their number.
  await recordProductEvent({
    entityType: "help_profile",
    eventName: "help_profile_saved",
    properties: { offers: offers.length, needs: needs.length, match_consent: matchConsent },
    source: "server",
    userId: user.id
  });

  return NextResponse.json({ offers, needs, matchConsent }, { headers: NO_STORE_HEADERS });
}
