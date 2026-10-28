import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { PLEDGE_MAX, PLEDGE_MIN, affordableAmounts, keptPostText, pledgeDeadline } from "@/lib/wordPledge";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
// The table and functions come from migration 20261028090000 and are not in the generated types yet.
type LooseDb = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

type QuoteRow = { user_challenge_id: string; title: Record<string, string> | null; max_percent: number | string; max_amount: number | string };

const titleOf = (title: Record<string, string> | null | undefined, locale: string) => title?.[locale] ?? title?.en ?? title?.ru ?? "";

/** Settles the person's own promises, then returns the active one (or the last result) and what a new one could use. */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const db = supabase as unknown as LooseDb;
  const locale = request.nextUrl.searchParams.get("locale") === "ru" ? "ru" : "en";

  const settled = await db.rpc("settle_word_pledges", { p_user_id: user.id });
  if (settled.error) return NextResponse.json({ available: false }, { headers: NO_STORE_HEADERS });

  const [latest, wallet, quotes] = await Promise.all([
    db.from("word_pledges").select("id,goal,amount,bonus_percent,bonus_amount,deadline_at,status,settled_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("wallet_accounts").select("balance").eq("user_id", user.id).maybeSingle(),
    // Accepted quests that can still take a word, each with its bonus percent (value, difficulty, length).
    db.rpc("word_pledge_quotes", { p_user_id: user.id })
  ]);
  const pledge = latest.data as { status: string; settled_at: string | null } | null;
  // A settled promise is shown for three days, so the person sees the result.
  const visible = pledge && (pledge.status === "active" || (pledge.settled_at && Date.now() - Date.parse(pledge.settled_at) < 3 * DAY_MS)) ? pledge : null;
  const balance = Number(wallet.data?.balance ?? 0);

  return NextResponse.json({
    available: true,
    pledge: visible,
    walletBalance: balance,
    amounts: affordableAmounts(balance),
    quests: ((quotes.data ?? []) as QuoteRow[])
      .map((row) => ({
        id: row.user_challenge_id,
        title: titleOf(row.title, locale),
        percent: Number(row.max_percent) || 0,
        amounts: affordableAmounts(balance, Number(row.max_amount) || PLEDGE_MIN)
      }))
      .filter((row) => row.title && row.percent > 0 && row.amounts.length)
      .slice(0, 20)
  }, { headers: NO_STORE_HEADERS });
}

/**
 * { userChallengeId, amount, nextMeetingDay }: puts the deposit on one accepted quest until the next meeting.
 * { action: "share", pledgeId }: publishes a kept word to the feed once, as proof that words here are kept.
 */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = supabase as unknown as LooseDb;

  if (body.action === "share") {
    const pledgeId = String(body.pledgeId ?? "");
    const { data: pledge } = await db.from("word_pledges").select("id,goal,bonus_amount,status").eq("id", pledgeId).eq("user_id", user.id).maybeSingle();
    if (!pledge || pledge.status !== "kept") return NextResponse.json({ error: "Not kept." }, { status: 400, headers: NO_STORE_HEADERS });
    const sourceKey = `word_pledge:${pledge.id}`;
    const { data: existing } = await db.from("feed_posts").select("id").eq("source_key", sourceKey).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, postId: existing.id }, { headers: NO_STORE_HEADERS });
    const { data: profile } = await db.from("user_profiles").select("default_locale").eq("user_id", user.id).maybeSingle();
    const now = new Date().toISOString();
    const { data: post, error: postError } = await db.from("feed_posts").insert({
      author_user_id: user.id,
      post_type: "manual",
      status: "published",
      visibility: "public",
      source_key: sourceKey,
      published_at: now,
      body: keptPostText(String(pledge.goal), Number(pledge.bonus_amount) || 0, profile?.default_locale === "ru" ? "ru" : "en")
    }).select("id").single();
    if (postError) return NextResponse.json({ error: postError.message }, { status: 500, headers: NO_STORE_HEADERS });
    await recordProductEvent({ eventName: "word_pledge_shared", userId: user.id, properties: {} }).catch(() => undefined);
    return NextResponse.json({ ok: true, postId: post.id }, { headers: NO_STORE_HEADERS });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < PLEDGE_MIN || amount > PLEDGE_MAX) {
    return NextResponse.json({ error: "Bad amount." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const nextDay = typeof body.nextMeetingDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.nextMeetingDay) ? body.nextMeetingDay : null;
  const goal = typeof body.goal === "string" ? body.goal.replace(/\s+/g, " ").trim().slice(0, 300) : "";

  const { data, error: rpcError } = await db.rpc("create_word_pledge", {
    p_user_id: user.id,
    p_user_challenge_id: String(body.userChallengeId ?? ""),
    p_goal: goal || "—",
    p_amount: amount,
    p_deadline_at: pledgeDeadline(nextDay, Date.now())
  });
  const result = (data ?? {}) as { pledge_id?: string; error?: string; max_percent?: number };
  if (rpcError || !result.pledge_id) {
    // result.error is a short code (amount, deadline, quest, quest_used, active, balance); the panel shows its text.
    return NextResponse.json({ error: result.error ?? "save" }, { status: 400, headers: NO_STORE_HEADERS });
  }
  await recordProductEvent({ eventName: "word_pledge_created", userId: user.id, properties: { amount, max_percent: Number(result.max_percent ?? 0) } }).catch(() => undefined);
  return NextResponse.json({ ok: true, pledgeId: result.pledge_id }, { headers: NO_STORE_HEADERS });
}
