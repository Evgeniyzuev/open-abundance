import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { weekStart } from "@/lib/leadPractices";
import { matchSmallWish, pickSmallWishOffers } from "@/lib/smallWishes";
import {
  MEETING_GOAL_STATUSES,
  MEETING_TEXT_MAX,
  dayKey,
  isMeetingDue,
  isMeetingRhythm,
  nextMeetingDay,
  stuckInboxText,
  suggestMeetingRhythm,
  type MeetingRhythm,
  type RhythmSuggestion
} from "@/lib/leadMeetings";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
// The tables come from migration 20261027200000 and are not in the generated types yet.
type LooseDb = { from: (table: string) => any };

const text = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MEETING_TEXT_MAX) : "");

/** The person's meeting rhythm, whether a meeting is due today, the last goal and what moved since the last meeting. */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const db = supabase as unknown as LooseDb;
  const now = Date.now();
  const locale = request.nextUrl.searchParams.get("locale") === "ru" ? "ru" : "en";

  const [settingsResult, lastResult, weekResult] = await Promise.all([
    db.from("lead_meeting_settings").select("rhythm").eq("user_id", user.id).maybeSingle(),
    db.from("lead_meetings").select("meeting_day,next_goal,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("lead_week_checkins").select("goal").eq("user_id", user.id).eq("week_start", weekStart(now)).maybeSingle()
  ]);
  if (settingsResult.error || lastResult.error) return NextResponse.json({ available: false }, { headers: NO_STORE_HEADERS });

  const rhythm = (settingsResult.data?.rhythm ?? null) as MeetingRhythm | null;
  const last = lastResult.data as { meeting_day: string; next_goal: string | null; created_at: string } | null;
  const since = last ? last.created_at : new Date(now - DAY_MS).toISOString();
  const { data: done } = await supabase
    .from("user_challenges")
    .select("updated_at,challenges(title)")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .gt("updated_at", since)
    .limit(20);
  const quests = ((done ?? []) as unknown as Array<{ challenges: { title: Record<string, string> | null } | null }>)
    .map((row) => row.challenges?.title?.[locale] ?? row.challenges?.title?.en ?? row.challenges?.title?.ru ?? "")
    .filter(Boolean);

  // Without a rhythm yet, the lead proposes one from the person's motive and their pace over the last week.
  let suggestion: RhythmSuggestion | null = null;
  if (!rhythm) {
    const [profile, week] = await Promise.all([
      db.from("user_profiles").select("quest_motive").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_challenges").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "completed").gt("updated_at", new Date(now - 7 * DAY_MS).toISOString())
    ]);
    suggestion = suggestMeetingRhythm({ motive: (profile.data?.quest_motive as string | null) ?? null, questsLast7: Number(week.count ?? 0) });
  }

  // A gentle nudge to a small wish (help or habit, never money): only for someone with no small wish in progress.
  let smallWish: { key: string } | null = null;
  if (rhythm && rhythm !== "off") {
    const [wishes, core] = await Promise.all([
      supabase.from("wishes").select("title,category,status").eq("owner_user_id", user.id).is("deleted_at", null),
      supabase.from("core_accounts").select("balance").eq("user_id", user.id).maybeSingle()
    ]);
    const rows = (wishes.data ?? []) as Array<{ title: string; category: string | null; status: string }>;
    const owned = rows.map((row) => matchSmallWish(row.title)).filter((wish): wish is NonNullable<typeof wish> => Boolean(wish));
    const smallInProgress = rows.some((row) => row.status !== "completed" && matchSmallWish(row.title));
    if (!smallInProgress) {
      const offer = pickSmallWishOffers({
        coreBalance: Number(core.data?.balance ?? 0),
        categories: rows.map((row) => row.category ?? "").filter(Boolean),
        ownedKeys: owned.map((wish) => wish.key),
        seed: `${user.id}:${dayKey(now)}`
      }).find((wish) => wish.kind !== "money");
      smallWish = offer ? { key: offer.key } : null;
    }
  }

  return NextResponse.json({
    available: true,
    rhythm,
    suggestion,
    smallWish,
    due: isMeetingDue(rhythm, last?.meeting_day ?? null, now),
    metToday: last?.meeting_day === dayKey(now),
    nextDay: nextMeetingDay(rhythm, now),
    lastGoal: last?.next_goal ?? null,
    weekGoal: (weekResult.data?.goal as string | undefined) ?? null,
    questsSince: quests
  }, { headers: NO_STORE_HEADERS });
}

/** { action: "rhythm", rhythm } or { action: "meeting", lastGoalStatus, question, nextGoal }. */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = supabase as unknown as LooseDb;
  const now = Date.now();

  if (body.action === "rhythm" && isMeetingRhythm(body.rhythm)) {
    const { error: saveError } = await db.from("lead_meeting_settings").upsert({ user_id: user.id, rhythm: body.rhythm, updated_at: new Date(now).toISOString() });
    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500, headers: NO_STORE_HEADERS });
    await recordProductEvent({ eventName: "lead_meeting_rhythm", userId: user.id, properties: { rhythm: body.rhythm } }).catch(() => undefined);
    return NextResponse.json({ ok: true, nextDay: nextMeetingDay(body.rhythm, now) }, { headers: NO_STORE_HEADERS });
  }

  if (body.action === "meeting") {
    const status = (MEETING_GOAL_STATUSES as readonly unknown[]).includes(body.lastGoalStatus) ? String(body.lastGoalStatus) : null;
    const row = {
      user_id: user.id,
      meeting_day: dayKey(now),
      last_goal_status: status,
      question: text(body.question) || null,
      next_goal: text(body.nextGoal) || null,
      quests_since: Math.max(0, Math.min(1000, Math.round(Number(body.questsSince) || 0)))
    };
    // The goal this meeting looked back on and how the meeting before went, for the "stuck" reaction below.
    const { data: previous } = await db.from("lead_meetings").select("next_goal,last_goal_status")
      .eq("user_id", user.id).lt("meeting_day", row.meeting_day).order("meeting_day", { ascending: false }).limit(2);
    const { error: saveError } = await db.from("lead_meetings").upsert(row, { onConflict: "user_id,meeting_day" });
    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500, headers: NO_STORE_HEADERS });
    // Stuck twice in a row: Nova writes first and offers to split the goal into tiny steps.
    const before = (previous ?? []) as Array<{ next_goal: string | null; last_goal_status: string | null }>;
    if (status === "not_yet" && before[0]?.last_goal_status === "not_yet") {
      const { data: profile } = await db.from("user_profiles").select("default_locale").eq("user_id", user.id).maybeSingle();
      const locale = profile?.default_locale === "ru" ? "ru" : "en";
      await db.from("nova_inbox_messages").insert({ user_id: user.id, body: stuckInboxText(before[0]?.next_goal ?? null, locale), source: "system", reason: "lead_stuck" }).then(() => undefined, () => undefined);
      await recordProductEvent({ eventName: "lead_stuck_reaction", userId: user.id, properties: {} }).catch(() => undefined);
    }
    await recordProductEvent({
      eventName: "lead_meeting_done",
      userId: user.id,
      properties: { status, has_question: Boolean(row.question), has_goal: Boolean(row.next_goal) }
    }).catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: NO_STORE_HEADERS });
}
