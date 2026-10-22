import { NextRequest, NextResponse } from "next/server";
import { buildEconomyReport, type EconomyInput } from "@/lib/economyReport";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const DAY_MS = 86_400_000;

function titleOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const text = record.ru ?? record.en;
    if (typeof text === "string") return text;
  }
  return "";
}

/**
 * GET /api/internal/economy/daily
 *
 * The daily economy report for the operator (and for the Vercel cron, which only writes it to the function log):
 * rewards paid in the last day and week, what a newly invited person costs, how many active people earned $1 and $10,
 * and sales that look like a circle of friends. Read only; it changes nothing and moves no money.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const byCron = Boolean(cronSecret && bearer && bearer === cronSecret);
  if (!byCron) {
    const { user, error } = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    if (!isGrowthOperator(user.id)) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  try {
    const db = createServiceSupabaseClient() as any;
    const now = Date.now();
    const since = new Date(now - 7 * DAY_MS).toISOString();
    const [completions, challenges, profiles, edges, events, deals] = await Promise.all([
      db.from("user_challenges").select("user_id,challenge_id,core_reward_amount,wallet_reward_amount,reward_settled_at").eq("status", "completed").gte("reward_settled_at", since).limit(10000),
      db.from("challenges").select("id,title,verification_logic").limit(2000),
      db.from("user_profiles").select("created_at").gte("created_at", since).limit(10000),
      db.from("referral_edges").select("referrer_user_id,referral_user_id,claimed_at").limit(20000),
      db.from("product_events").select("user_id,occurred_at").eq("event_name", "app_open").not("user_id", "is", null).gte("occurred_at", since).limit(20000),
      db.from("marketplace_deals").select("seller_user_id,buyer_user_id,price_amount,completed_at").eq("status", "completed").gte("completed_at", since).limit(5000)
    ]);
    const failed = [completions, challenges, profiles, edges, events, deals].find((result) => result.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500, headers: NO_STORE_HEADERS });

    const allEdges = (edges.data ?? []).map((row: any) => ({ referrerId: row.referrer_user_id, referralId: row.referral_user_id, at: row.claimed_at ?? "" }));
    const input: EconomyInput = {
      completions: (completions.data ?? []).map((row: any) => ({ userId: row.user_id, challengeId: row.challenge_id, core: Number(row.core_reward_amount ?? 0), wallet: Number(row.wallet_reward_amount ?? 0), at: row.reward_settled_at })),
      challenges: (challenges.data ?? []).map((row: any) => ({ id: row.id, title: titleOf(row.title), logic: row.verification_logic ?? null })),
      registrations: (profiles.data ?? []).map((row: any) => row.created_at),
      referrals: allEdges,
      activity: (events.data ?? []).map((row: any) => ({ userId: row.user_id, at: row.occurred_at })),
      deals: (deals.data ?? []).map((row: any) => ({ sellerId: row.seller_user_id, buyerId: row.buyer_user_id, price: Number(row.price_amount ?? 0), at: row.completed_at }))
    };
    const report = buildEconomyReport(input, now);
    if (byCron) console.log("economy-daily", JSON.stringify({ ...report, suspiciousSales: report.suspiciousSales.length }));
    return NextResponse.json(report, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Could not build the report." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
