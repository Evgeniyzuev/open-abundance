import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { PLEDGE_MAX, PLEDGE_MIN, affordableAmounts, pledgeBonus, pledgeDeadline } from "@/lib/wordPledge";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
// The table and functions come from migration 20261028090000 and are not in the generated types yet.
type LooseDb = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

type QuestRow = { id: string; challenges: { title: Record<string, string> | null } | null };

const titleOf = (title: Record<string, string> | null | undefined, locale: string) => title?.[locale] ?? title?.en ?? title?.ru ?? "";

/** Settles the person's own promises, then returns the active one (or the last result) and what a new one could use. */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const db = supabase as unknown as LooseDb;
  const locale = request.nextUrl.searchParams.get("locale") === "ru" ? "ru" : "en";

  const settled = await db.rpc("settle_word_pledges", {});
  if (settled.error) return NextResponse.json({ available: false }, { headers: NO_STORE_HEADERS });

  const [latest, wallet, quests, used] = await Promise.all([
    db.from("word_pledges").select("id,goal,amount,bonus_amount,deadline_at,status,settled_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("wallet_accounts").select("balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_challenges").select("id,challenges(title)").eq("user_id", user.id).eq("status", "accepted").order("created_at", { ascending: false }).limit(20),
    db.from("word_pledges").select("user_challenge_id").eq("user_id", user.id)
  ]);
  const usedIds = new Set(((used.data ?? []) as Array<{ user_challenge_id: string }>).map((row) => row.user_challenge_id));
  const pledge = latest.data as { status: string; settled_at: string | null } | null;
  // A settled promise is shown for three days, so the person sees the result.
  const visible = pledge && (pledge.status === "active" || (pledge.settled_at && Date.now() - Date.parse(pledge.settled_at) < 3 * DAY_MS)) ? pledge : null;
  const balance = Number(wallet.data?.balance ?? 0);

  return NextResponse.json({
    available: true,
    pledge: visible,
    walletBalance: balance,
    amounts: affordableAmounts(balance),
    quests: ((quests.data ?? []) as unknown as QuestRow[])
      .filter((row) => !usedIds.has(row.id))
      .map((row) => ({ id: row.id, title: titleOf(row.challenges?.title, locale) }))
      .filter((row) => row.title)
  }, { headers: NO_STORE_HEADERS });
}

/** { userChallengeId, amount, nextMeetingDay }: puts the deposit on one accepted quest until the next meeting. */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = supabase as unknown as LooseDb;
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < PLEDGE_MIN || amount > PLEDGE_MAX) {
    return NextResponse.json({ error: "Bad amount." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const nextDay = typeof body.nextMeetingDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.nextMeetingDay) ? body.nextMeetingDay : null;
  const goal = typeof body.goal === "string" ? body.goal.replace(/\s+/g, " ").trim().slice(0, 300) : "";

  const { data, error: rpcError } = await db.rpc("create_word_pledge", {
    p_user_challenge_id: String(body.userChallengeId ?? ""),
    p_goal: goal || "—",
    p_amount: amount,
    p_deadline_at: pledgeDeadline(nextDay, Date.now())
  });
  const result = (data ?? {}) as { pledge_id?: string; error?: string };
  if (rpcError || !result.pledge_id) {
    return NextResponse.json({ error: result.error ?? rpcError?.message ?? "Could not save." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  await recordProductEvent({ eventName: "word_pledge_created", userId: user.id, properties: { amount, bonus: pledgeBonus(amount) } }).catch(() => undefined);
  return NextResponse.json({ ok: true, pledgeId: result.pledge_id }, { headers: NO_STORE_HEADERS });
}
