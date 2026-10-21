import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { cleanSpendCategories, demandMap } from "@/lib/spendCategories";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET/PUT /api/spend-intents
 *
 * The categories of regular spending the person is ready to move into Open Abundance and the consent to receive
 * favourable offers for them. GET also returns the community demand map: counts per category, only for categories
 * chosen by at least five people who agreed to offers. Amounts and products are never asked for or stored.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const db = supabase as any;

  const { data, error: readError } = await db
    .from("user_spend_intents")
    .select("categories,offers_consent")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: "Could not load." }, { status: 500, headers: NO_STORE_HEADERS });

  const { data: rows, error: mapError } = await db
    .from("user_spend_intents")
    .select("categories")
    .eq("offers_consent", true)
    .limit(20000);

  return NextResponse.json(
    {
      categories: cleanSpendCategories(data?.categories),
      offersConsent: Boolean(data?.offers_consent),
      demand: mapError ? [] : demandMap((rows ?? []) as Array<{ categories: string[] }>)
    },
    { headers: NO_STORE_HEADERS }
  );
}

export async function PUT(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400, headers: NO_STORE_HEADERS });

  const categories = cleanSpendCategories(body.categories);
  const offersConsent = body.offersConsent === true;
  const db = supabase as any;

  const { data: existing } = await db.from("user_spend_intents").select("offers_consent").eq("user_id", user.id).maybeSingle();
  const consentChanged = Boolean(existing?.offers_consent) !== offersConsent;
  const now = new Date().toISOString();
  const { error: writeError } = await db.from("user_spend_intents").upsert({
    user_id: user.id,
    categories,
    offers_consent: offersConsent,
    ...(consentChanged || !existing ? { consent_updated_at: now } : {}),
    updated_at: now
  });
  if (writeError) return NextResponse.json({ error: "Could not save." }, { status: 500, headers: NO_STORE_HEADERS });

  // Counts only: the event never says which categories were chosen.
  await recordProductEvent({
    entityType: "spend_intents",
    eventName: "spend_intents_saved",
    properties: { categories: categories.length, offers_consent: offersConsent },
    source: "server",
    userId: user.id
  });

  return NextResponse.json({ categories, offersConsent }, { headers: NO_STORE_HEADERS });
}
