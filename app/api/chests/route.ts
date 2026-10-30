import { NextRequest, NextResponse } from "next/server";
import { CHEST_DEFAULTS, chestState, chestsToGrant, utcDay, type ChestSettings, type DailyChest } from "@/lib/dailyChests";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function sum(rows: Array<Record<string, unknown>> | null | undefined, column: string): number {
  let total = 0;
  for (const row of rows ?? []) {
    const value = Number(row[column]);
    if (Number.isFinite(value) && value > 0) total += value;
  }
  return total;
}

async function loadSettings(db: any): Promise<ChestSettings> {
  const { data } = await db.from("chest_settings").select("*").eq("id", true).maybeSingle();
  if (!data) return CHEST_DEFAULTS;
  const odds = Array.isArray(data.odds)
    ? data.odds.map((item: any) => ({ amount: Number(item?.amount), weight: Number(item?.weight) }))
    : CHEST_DEFAULTS.odds;
  return {
    firstChestAfterTasks: Number(data.first_chest_after_tasks ?? CHEST_DEFAULTS.firstChestAfterTasks),
    keyAt: Number(data.key_core_amount ?? CHEST_DEFAULTS.keyAt),
    nextChestAt: Number(data.next_chest_core_amount ?? CHEST_DEFAULTS.nextChestAt),
    odds
  };
}

// Core earned by actions today (UTC): task rewards and referral rewards into Core. Top-ups, % income and chest
// rewards do not count, so the key is earned by doing things.
async function earnedToday(db: any, userId: string, now: Date): Promise<number> {
  const since = `${utcDay(now)}T00:00:00Z`;
  const [tasks, referrals] = await Promise.all([
    db.from("user_challenges").select("core_reward_amount").eq("user_id", userId).eq("status", "completed").gte("reward_settled_at", since),
    db.from("referral_rewards").select("amount").eq("referrer_user_id", userId).eq("destination", "core").gte("created_at", since)
  ]);
  if (tasks.error) throw new Error(tasks.error.message);
  return sum(tasks.data, "core_reward_amount") + (referrals.error ? 0 : sum(referrals.data, "amount"));
}

async function loadChests(db: any, userId: string): Promise<DailyChest[]> {
  const { data, error } = await db.from("daily_chests").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    kind: row.kind,
    earnedOn: row.earned_on,
    opensOn: row.opens_on,
    status: row.status,
    rewardCoreAmount: row.reward_core_amount === null ? null : Number(row.reward_core_amount),
    openedOn: row.opened_on
  }));
}

async function currentState(db: any, userId: string) {
  const now = new Date();
  const [settings, earned, chests, completed] = await Promise.all([
    loadSettings(db),
    earnedToday(db, userId, now),
    loadChests(db, userId),
    db.from("user_challenges").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed")
  ]);
  const completedTasks = completed.count ?? 0;
  const grants = chestsToGrant({ chests, completedTasks, earnedToday: earned, now, settings });
  let fresh = chests;
  if (grants.length) {
    for (const grant of grants) {
      // A parallel request may have added it already: the unique indexes keep one, the duplicate error is ignored.
      await db.from("daily_chests").insert({ user_id: userId, kind: grant.kind, earned_on: grant.earnedOn, opens_on: grant.opensOn });
    }
    fresh = await loadChests(db, userId);
  }
  const added = grants.map((grant) => grant.kind);
  return { state: chestState({ chests: fresh, completedTasks, earnedToday: earned, now, settings }), added, earned };
}

// The day bar with the key and the chests; adds the chests that became due.
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const { state, added } = await currentState(supabase, user.id);
    return NextResponse.json({ ...state, added }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to load chests." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

// Opens the chest the key fits: the server rolls the Core bonus by the open odds and adds it to Core.
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const db = supabase as any;
    const { state, earned } = await currentState(db, user.id);
    if (!state.openable) {
      return NextResponse.json({ error: state.hasKey ? "No chest to open yet." : "No key yet today." }, { status: 409, headers: NO_STORE_HEADERS });
    }
    const { data, error: openError } = await db.rpc("open_daily_chest", { p_user_id: user.id, p_chest_id: state.openable.id, p_earned_today: earned });
    if (openError) return NextResponse.json({ error: openError.message }, { status: 409, headers: NO_STORE_HEADERS });
    const reward = Number(data?.[0]?.reward_core_amount ?? 0);
    const [{ data: core }, after] = await Promise.all([
      db.from("core_accounts").select("*").eq("user_id", user.id).maybeSingle(),
      currentState(db, user.id)
    ]);
    return NextResponse.json({ reward, core, state: after.state }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to open the chest." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
