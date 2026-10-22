import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { goalCard, normalizeWheel, VALUES_CHALLENGE_SWIPES, type SwipeDecision, type Wheel } from "@/lib/lifeValues";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const WHEEL_HISTORY_LIMIT = 12;

type SwipeRecord = { d: SwipeDecision; at: string; wishId?: string };
type ValuesRow = {
  wheel: Wheel | null;
  wheel_saved_at: string | null;
  wheel_history: unknown[];
  swipes: Record<string, SwipeRecord>;
  swipe_count: number;
};

// The person's values profile: the latest wheel, the latest decision per goal card and the swipe count.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const { row, error: loadError } = await loadRow(supabase, user.id);
    if (loadError) return NextResponse.json({ error: loadError }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ profile: toPayload(row) }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to load values." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

// { action: "wheel", wheel } saves the wheel; { action: "swipe", cardKey, decision, locale } records one swipe.
// "want" turns the card into a private wish once (an active wish with the same title is reused).
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const { row, error: loadError } = await loadRow(supabase, user.id);
    if (loadError) return NextResponse.json({ error: loadError }, { status: 500, headers: NO_STORE_HEADERS });
    const now = new Date().toISOString();

    if (body.action === "wheel") {
      const wheel = normalizeWheel(body.wheel);
      if (!wheel) return NextResponse.json({ error: "Rate every area and write criteria for at least one." }, { status: 400, headers: NO_STORE_HEADERS });
      const history = [{ at: now, wheel }, ...(row?.wheel_history ?? [])].slice(0, WHEEL_HISTORY_LIMIT);
      const { data, error: saveError } = await (supabase as any)
        .from("user_values_profiles")
        .upsert({ user_id: user.id, wheel, wheel_saved_at: now, wheel_history: history, updated_at: now }, { onConflict: "user_id" })
        .select("wheel,wheel_saved_at,wheel_history,swipes,swipe_count")
        .single();
      if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500, headers: NO_STORE_HEADERS });
      await recordProductEvent({ entityType: "values", eventName: "values_wheel_saved", properties: { repeat: Boolean(row?.wheel) }, source: "server", userId: user.id });
      return NextResponse.json({ profile: toPayload(data as ValuesRow) }, { headers: NO_STORE_HEADERS });
    }

    if (body.action === "swipe") {
      const card = goalCard(body.cardKey);
      const decision = body.decision === "want" || body.decision === "skip" ? body.decision : null;
      if (!card || !decision) return NextResponse.json({ error: "Unknown card." }, { status: 400, headers: NO_STORE_HEADERS });
      const locale = body.locale === "ru" ? "ru" : "en";
      const swipes = { ...(row?.swipes ?? {}) };
      const previous = swipes[card.key];
      let wishId = previous?.wishId;
      let wishCreated = false;

      if (decision === "want" && !wishId) {
        const title = card.title[locale];
        const { data: existing, error: existingError } = await supabase
          .from("wishes")
          .select("id")
          .eq("owner_user_id", user.id)
          .eq("title", title)
          .eq("status", "active")
          .is("deleted_at", null)
          .limit(1);
        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500, headers: NO_STORE_HEADERS });
        wishId = existing?.[0]?.id;
        if (!wishId) {
          const { data: wish, error: wishError } = await supabase
            .from("wishes")
            .insert({ owner_user_id: user.id, title, description: card.description[locale], category: card.sphere, visibility: "private" })
            .select("id")
            .single();
          if (wishError) return NextResponse.json({ error: wishError.message }, { status: 500, headers: NO_STORE_HEADERS });
          wishId = wish.id;
          wishCreated = true;
          await recordProductEvent({ entityId: wish.id, entityType: "wish", eventName: "wish_created", properties: { has_target: false, visibility: "private", source: "values_cards" }, source: "server", userId: user.id });
        }
      }

      swipes[card.key] = { d: decision, at: now, ...(wishId ? { wishId } : {}) };
      const { data, error: saveError } = await (supabase as any)
        .from("user_values_profiles")
        .upsert({ user_id: user.id, swipes, swipe_count: (row?.swipe_count ?? 0) + 1, updated_at: now }, { onConflict: "user_id" })
        .select("wheel,wheel_saved_at,wheel_history,swipes,swipe_count")
        .single();
      if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500, headers: NO_STORE_HEADERS });
      return NextResponse.json({ profile: toPayload(data as ValuesRow), wishCreated }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to save values." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

async function loadRow(supabase: unknown, userId: string): Promise<{ row: ValuesRow | null; error?: string }> {
  const { data, error } = await (supabase as any)
    .from("user_values_profiles")
    .select("wheel,wheel_saved_at,wheel_history,swipes,swipe_count")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as ValuesRow | null) ?? null };
}

function toPayload(row: ValuesRow | null) {
  const swipes = row?.swipes ?? {};
  return {
    wheel: row?.wheel ?? null,
    wheelSavedAt: row?.wheel_saved_at ?? null,
    decisions: Object.fromEntries(Object.entries(swipes).map(([key, value]) => [key, value.d])),
    // Wishes that came from "I want" swipes, so Wishes can keep them apart from the ones the person wrote.
    wishIds: Object.values(swipes).filter((value) => value.d === "want" && value.wishId).map((value) => value.wishId as string),
    swipeCount: row?.swipe_count ?? 0,
    challengeSwipes: VALUES_CHALLENGE_SWIPES
  };
}
