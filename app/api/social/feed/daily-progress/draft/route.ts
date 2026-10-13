import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { loadRealityDayContext, realityDayHasContent, upsertRealityDayDraft } from "@/lib/serverRealityDay";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Read-only preview of the user's day: summary, level and the existing day post, if any.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const context = await loadRealityDayContext(supabase, user.id, normalizeDate(request.nextUrl.searchParams.get("date")));
    const { data: snapshot, error: snapshotError } = await supabase
      .from("progress_snapshots")
      .select("id")
      .eq("user_id", user.id)
      .eq("source_type", "daily_core_accrual")
      .eq("source_date", context.date)
      .maybeSingle();
    if (snapshotError) throw snapshotError;

    let post: { id: string; status: string; published_at: string | null } | null = null;
    if (snapshot) {
      const { data, error: postError } = await supabase
        .from("feed_posts")
        .select("id,status,published_at")
        .eq("author_user_id", user.id)
        .eq("snapshot_id", snapshot.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (postError) throw postError;
      post = data;
    }

    return NextResponse.json(
      {
        date: context.date,
        summary: context.summary,
        levelBefore: context.levelBefore,
        levelAfter: context.levelAfter,
        coreGrowth: Number(context.accrual?.core_amount ?? 0) + context.teamBonusAmount,
        hasContent: realityDayHasContent(context),
        post
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load the day." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// Creates or refreshes the day post. With `ifContent`, an empty day creates nothing.
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const body = await readJsonBody(request);
    const context = await loadRealityDayContext(supabase, user.id, normalizeDate(body.date));
    if (body.ifContent === true && !realityDayHasContent(context)) {
      return NextResponse.json({ post: null, summary: context.summary }, { headers: NO_STORE_HEADERS });
    }

    const draft = await upsertRealityDayDraft(supabase, user.id, context);
    return NextResponse.json(draft, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create daily draft." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function readJsonBody(request: NextRequest): Promise<{ date?: unknown; ifContent?: unknown }> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Only today or past days; the post describes what already happened.
  return value <= new Date().toISOString().slice(0, 10) ? value : null;
}
