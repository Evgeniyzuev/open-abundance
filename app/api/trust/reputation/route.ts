import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const CONFIG_VERSION = "trust-shadow-v2";

// The owner's private reputation: the latest daily shadow snapshot and what it is made of.
// Only the owner's own numbers; no rater names, review texts or other users' scores.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    // Trust v2 shadow tables are not in the generated types yet.
    const db = supabase as any;
    const { data: summary, error: summaryError } = await db
      .from("trust_v2_shadow_summaries")
      .select("as_of_date,starter_score,target_review_delta,rater_review_delta,raw_score,eligible_review_count,positive_review_count,neutral_review_count,negative_review_count")
      .eq("config_version", CONFIG_VERSION)
      .eq("user_id", user.id)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (summaryError) throw summaryError;

    const { data: config, error: configError } = await db
      .from("trust_v2_score_configs")
      .select("starter")
      .eq("config_version", CONFIG_VERSION)
      .maybeSingle();
    if (configError) throw configError;
    const starter = Number(config?.starter ?? 0.25);

    if (!summary) {
      return NextResponse.json({ reputation: { score: starter, starter, fromBuyers: 0, fromOwnReviews: 0, received: { total: 0, positive: 0, neutral: 0, negative: 0, buyers: 0 }, asOfDate: null } }, { headers: NO_STORE_HEADERS });
    }

    // Received reviews and distinct buyers as of the same snapshot (counts only).
    const { data: received, error: receivedError } = await db
      .from("trust_v2_shadow_contributions")
      .select("rater_user_id,raw_delta")
      .eq("config_version", CONFIG_VERSION)
      .eq("as_of_date", summary.as_of_date)
      .eq("source_type", "marketplace_review")
      .eq("disposition", "applied")
      .eq("target_user_id", user.id)
      .limit(5000);
    if (receivedError) throw receivedError;
    const rows = (received ?? []) as Array<{ rater_user_id: string; raw_delta: number }>;

    return NextResponse.json({
      reputation: {
        score: Number(summary.raw_score),
        starter: Number(summary.starter_score),
        fromBuyers: Number(summary.target_review_delta),
        fromOwnReviews: Number(summary.rater_review_delta),
        received: {
          total: rows.length,
          positive: rows.filter((row) => Number(row.raw_delta) > 0).length,
          neutral: rows.filter((row) => Number(row.raw_delta) === 0).length,
          negative: rows.filter((row) => Number(row.raw_delta) < 0).length,
          buyers: new Set(rows.map((row) => row.rater_user_id)).size
        },
        asOfDate: summary.as_of_date
      }
    }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load reputation." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
