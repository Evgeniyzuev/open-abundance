import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { normalizeUuid } from "@/lib/uuid";
import {
  MIDWEEK_STATUSES,
  REVIEW_STATUSES,
  WEEK_GOAL_MAX,
  WEEK_NOTE_MAX,
  kitPracticeFor,
  practiceKeyFor,
  weekPhase,
  weekStart
} from "@/lib/leadPractices";

export const dynamic = "force-dynamic";

const COLUMNS = "user_id,week_start,practice_key,goal,wish_id,midweek_status,midweek_at,review_status,review_note,reviewed_at,visibility,updated_at";

type CheckinRow = Record<string, unknown> & { user_id: string };
// lead_week_checkins comes from migration 20261027190000 and is not in the generated types yet.
type LooseDb = { from: (table: string) => any };

/**
 * The person's week with the lead (goal, mid-week answer, result) and, for live leads, the practice of the week
 * to pass on plus the weeks their followers chose to share.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const db = supabase as unknown as LooseDb;
  const now = Date.now();
  const start = weekStart(now);

  const [weekResult, membershipResult, followersResult] = await Promise.all([
    db.from("lead_week_checkins").select(COLUMNS).eq("user_id", user.id).eq("week_start", start).maybeSingle(),
    supabase.from("team_memberships").select("leader_user_id").eq("member_user_id", user.id).eq("is_active", true).maybeSingle(),
    supabase.from("team_memberships").select("member_user_id").eq("leader_user_id", user.id).eq("is_active", true)
  ]);
  if (weekResult.error) return NextResponse.json({ error: weekResult.error.message, available: false }, { status: 200, headers: NO_STORE_HEADERS });

  const followerIds = (followersResult.data ?? []).map((row) => row.member_user_id);
  let followers: Array<{
    userId: string; name: string | null; goal: string | null; midweek: string | null; review: string | null;
    metRecently: boolean; wordGiven: boolean; stuck: boolean;
  }> = [];
  if (followerIds.length) {
    // Only the weeks a follower chose to share with the lead; for them, also whether they met their lead recently,
    // gave their word, or got stuck, so the lead knows whom to write to first.
    const weeks = await db.from("lead_week_checkins").select(COLUMNS).eq("week_start", start).eq("visibility", "lead").in("user_id", followerIds);
    const sharedIds = ((weeks.data ?? []) as CheckinRow[]).map((row) => row.user_id);
    const since = new Date(now - 3 * 86_400_000).toISOString().slice(0, 10);
    const [profiles, meetings, pledges] = sharedIds.length ? await Promise.all([
      supabase.from("user_profiles").select("user_id,display_name,username").in("user_id", sharedIds),
      db.from("lead_meetings").select("user_id,meeting_day,last_goal_status").in("user_id", sharedIds).gte("meeting_day", since),
      db.from("word_pledges").select("user_id").eq("status", "active").in("user_id", sharedIds)
    ]) : [{ data: [] }, { data: [] }, { data: [] }];
    const meetingRows = (meetings.data ?? []) as Array<{ user_id: string; meeting_day: string; last_goal_status: string | null }>;
    const pledgeIds = new Set(((pledges.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));
    followers = ((weeks.data ?? []) as CheckinRow[]).map((row) => {
      const profile = ((profiles.data ?? []) as Array<{ user_id: string; display_name: string | null; username: string | null }>).find((item) => item.user_id === row.user_id);
      const own = meetingRows.filter((item) => item.user_id === row.user_id).sort((a, b) => b.meeting_day.localeCompare(a.meeting_day));
      const midweek = (row.midweek_status as string | null) ?? null;
      return {
        userId: row.user_id,
        name: profile?.display_name || (profile?.username ? `@${profile.username}` : null),
        goal: (row.goal as string | null) ?? null,
        midweek,
        review: (row.review_status as string | null) ?? null,
        metRecently: own.length > 0,
        wordGiven: pledgeIds.has(row.user_id),
        stuck: midweek === "stuck" || midweek === "need_help" || own[0]?.last_goal_status === "not_yet"
      };
    }).sort((left, right) => Number(right.stuck) - Number(left.stuck));
  }

  return NextResponse.json({
    available: true,
    weekStart: start,
    phase: weekPhase(now),
    practiceKey: (weekResult.data?.practice_key as string | undefined) ?? practiceKeyFor(user.id, start),
    week: weekResult.data ?? null,
    hasLiveLead: Boolean(membershipResult.data?.leader_user_id),
    lead: followerIds.length ? { followers: followerIds.length, kitPracticeKey: kitPracticeFor(start).key, shared: followers } : null
  }, { headers: NO_STORE_HEADERS });
}

type Body = {
  action?: unknown;
  goal?: unknown;
  wishId?: unknown;
  status?: unknown;
  note?: unknown;
  visibility?: unknown;
};

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Saves one step of the week: the goal, the mid-week answer or the result. */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    // Answered below.
  }
  const db = supabase as unknown as LooseDb;
  const now = new Date();
  const start = weekStart(now.getTime());
  const base = { user_id: user.id, week_start: start, practice_key: practiceKeyFor(user.id, start), updated_at: now.toISOString() };
  let patch: Record<string, unknown>;

  if (body.action === "goal") {
    const goal = text(body.goal, WEEK_GOAL_MAX);
    if (!goal) return NextResponse.json({ error: "Goal is required." }, { status: 400, headers: NO_STORE_HEADERS });
    patch = { goal, wish_id: normalizeUuid(body.wishId), visibility: body.visibility === "private" ? "private" : "lead" };
  } else if (body.action === "midweek" && (MIDWEEK_STATUSES as readonly unknown[]).includes(body.status)) {
    patch = { midweek_status: body.status, midweek_at: now.toISOString() };
  } else if (body.action === "review" && (REVIEW_STATUSES as readonly unknown[]).includes(body.status)) {
    patch = { review_status: body.status, review_note: text(body.note, WEEK_NOTE_MAX) || null, reviewed_at: now.toISOString() };
  } else if (body.action === "visibility") {
    patch = { visibility: body.visibility === "private" ? "private" : "lead" };
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const { data: existing } = await db.from("lead_week_checkins").select("practice_key").eq("user_id", user.id).eq("week_start", start).maybeSingle();
  const row = existing ? { ...patch, updated_at: base.updated_at } : { ...base, ...patch };
  const query = existing
    ? db.from("lead_week_checkins").update(row).eq("user_id", user.id).eq("week_start", start)
    : db.from("lead_week_checkins").insert(row);
  const { error: saveError } = await query;
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500, headers: NO_STORE_HEADERS });

  await recordProductEvent({
    eventName: `lead_week_${String(body.action)}`,
    userId: user.id,
    properties: { practice: (existing?.practice_key as string | undefined) ?? base.practice_key, status: typeof body.status === "string" ? body.status : null }
  }).catch(() => undefined);

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
