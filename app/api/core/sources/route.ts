import { NextRequest, NextResponse } from "next/server";
import { summarizeCoreSources } from "@/lib/coreSources";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const PAGE = 1000;

// Sums one amount column over every matching row, page by page, so long histories are not cut at 1000 rows.
async function sumColumn(build: (column: string) => any, column: string): Promise<number> {
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(column).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<Record<string, number | string | null>>;
    for (const row of rows) {
      const value = Number(row[column]);
      if (Number.isFinite(value) && value > 0) total += value;
    }
    if (rows.length < PAGE) return total;
  }
}

// Where the signed-in person's Core came from: top-ups, % income kept in Core, rewards for actions.
// Same sources as /api/core/history, summed over all time. Read only.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const db = supabase as any;

    const [account, topup, income, challenges, reviews, referrals, team] = await Promise.all([
      db.from("core_accounts").select("balance").eq("user_id", user.id).maybeSingle(),
      sumColumn((column) => db.from("wallet_ledger").select(column).eq("user_id", user.id).eq("operation_type", "wallet_core_topup").eq("direction", "debit").order("id"), "amount"),
      sumColumn((column) => db.from("daily_core_accruals").select(column).eq("user_id", user.id).order("accrual_date"), "core_amount"),
      sumColumn((column) => db.from("user_challenges").select(column).eq("user_id", user.id).eq("status", "completed").order("id"), "core_reward_amount"),
      sumColumn((column) => db.from("peer_review_answers").select(column).eq("reviewer_user_id", user.id).eq("reward_status", "paid").order("id"), "core_reward_amount"),
      sumColumn((column) => db.from("referral_rewards").select(column).eq("referrer_user_id", user.id).eq("destination", "core").order("id"), "amount"),
      sumColumn((column) => db.from("team_core_growth_rewards").select(column).eq("leader_user_id", user.id).order("id"), "core_amount")
    ]);
    if (account.error) return NextResponse.json({ error: account.error.message }, { status: 500, headers: NO_STORE_HEADERS });

    const balance = Number(account.data?.balance ?? 0);
    return NextResponse.json(
      summarizeCoreSources(balance, { topup, income, challenges, reviews, referrals, team }),
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load Core sources." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
