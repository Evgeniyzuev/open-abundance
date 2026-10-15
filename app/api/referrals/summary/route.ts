import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type RewardRow = {
  id: string;
  kind: "level_2" | "humanity_confirmed";
  amount: number | string;
  destination: "wallet" | "core";
  created_at: string;
  seen_at: string | null;
};

/**
 * GET /api/referrals/summary
 *
 * The signed-in user's referral statistics and rewards: how many people they invited, how many of
 * them are humanity-confirmed, the paid amounts per destination, the latest rewards and the ones the
 * user has not seen yet. Reward amounts come from the settings so the texts never drift.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);

  const db = supabase as any;
  const [edges, rewards, settings] = await Promise.all([
    db.from("referral_edges").select("referral_user_id").eq("referrer_user_id", user.id),
    db.from("referral_rewards").select("id,kind,amount,destination,created_at,seen_at").eq("referrer_user_id", user.id).order("created_at", { ascending: false }).limit(200),
    db.from("referral_reward_settings").select("enabled,level_two_core_amount,humanity_amount").eq("id", true).maybeSingle()
  ]);
  for (const result of [edges, rewards, settings]) if (result.error) return json({ error: result.error.message }, 500);

  const referralIds = ((edges.data ?? []) as Array<{ referral_user_id: string }>).map((row) => row.referral_user_id);
  let humanCount = 0;
  if (referralIds.length > 0) {
    const { data: confirmed, error: confirmedError } = await db
      .from("humanity_verifications")
      .select("user_id")
      .in("user_id", referralIds)
      .gte("humanity_level", 2);
    if (confirmedError) return json({ error: confirmedError.message }, 500);
    humanCount = (confirmed ?? []).length;
  }

  const rows = (rewards.data ?? []) as RewardRow[];
  const sum = (destination: "wallet" | "core") => rows.filter((row) => row.destination === destination).reduce((total, row) => total + Number(row.amount), 0);

  return json({
    enabled: settings.data?.enabled ?? false,
    amounts: {
      levelTwoCore: Number(settings.data?.level_two_core_amount ?? 0),
      humanity: Number(settings.data?.humanity_amount ?? 0)
    },
    referrals: { total: referralIds.length, human: humanCount },
    rewards: { wallet: sum("wallet"), core: sum("core") },
    unseen: rows.filter((row) => !row.seen_at).map((row) => ({ id: row.id, kind: row.kind, amount: Number(row.amount), destination: row.destination, createdAt: row.created_at }))
  }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
