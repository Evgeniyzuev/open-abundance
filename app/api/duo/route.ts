import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DUO_LOGIC, canCheckIn, cleanDuoCode, cleanDuoNote, duoProgress, type DuoCheckin } from "@/lib/duoQuest";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// «A task for two» (lib/duoQuest.ts): GET the viewer's duo (or an invitation by ?code=), POST create / join / checkin /
// leave. The reward itself is claimed through /api/challenges/check (logic duo_week) once the duo succeeded.

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function displayName(db: any, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await db.from("user_profiles").select("display_name,username").eq("user_id", userId).maybeSingle();
  const name = data?.display_name?.trim() || (data?.username ? `@${data.username}` : null);
  return name ? String(name).slice(0, 60) : null;
}

async function currentDuo(db: any, userId: string) {
  const { data, error } = await db
    .from("duo_quests")
    .select("*")
    .or(`inviter_user_id.eq.${userId},partner_user_id.eq.${userId}`)
    .neq("status", "ended")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function duoChallengeId(db: any): Promise<string | null> {
  const { data } = await db.from("challenges").select("id").eq("verification_logic", DUO_LOGIC).eq("is_active", true).maybeSingle();
  return data?.id ?? null;
}

async function describe(db: any, row: any, userId: string) {
  const { data: rows, error } = await db.from("duo_checkins").select("user_id,day,note").eq("duo_id", row.id).order("day", { ascending: true });
  if (error) throw new Error(error.message);
  const checkins: DuoCheckin[] = (rows ?? []).map((item: any) => ({ userId: item.user_id, day: item.day, note: item.note }));
  const duo = { startedOn: row.started_on, days: row.days, neededDays: row.needed_days, inviterUserId: row.inviter_user_id, partnerUserId: row.partner_user_id };
  const progress = duoProgress(duo, checkins, userId, today());
  // The window ran out without both reaching the goal: the duo ends, and a new one can start.
  if (row.status === "active" && progress.over) {
    await db.from("duo_quests").update({ status: "ended" }).eq("id", row.id).eq("status", "active");
  }
  const otherId = row.inviter_user_id === userId ? row.partner_user_id : row.inviter_user_id;
  const { data: ref } = await db.from("referral_codes").select("code").eq("user_id", row.inviter_user_id).eq("is_active", true).limit(1).maybeSingle();
  const invitePath = ref?.code ? `/i/${encodeURIComponent(ref.code)}?duo=${row.invite_code}` : `/?duo=${row.invite_code}`;
  return {
    id: row.id,
    status: row.status === "active" && progress.over ? "ended" : row.status,
    isInviter: row.inviter_user_id === userId,
    inviteCode: row.invite_code,
    invitePath,
    friendName: await displayName(db, otherId),
    days: row.days,
    neededDays: row.needed_days,
    canCheckIn: row.status === "active" && canCheckIn(progress, row.days),
    progress,
    notes: checkins.slice(-14).reverse().map((item) => ({ mine: item.userId === userId, day: item.day, note: item.note }))
  };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return json({ error }, 401);
    const db = supabase as any;
    const code = cleanDuoCode(request.nextUrl.searchParams.get("code"));
    if (code) {
      const { data: row } = await db.from("duo_quests").select("*").eq("invite_code", code).maybeSingle();
      if (!row) return json({ invite: null });
      return json({
        invite: {
          code,
          inviterName: await displayName(db, row.inviter_user_id),
          own: row.inviter_user_id === user.id,
          joined: row.partner_user_id === user.id,
          joinable: row.status === "waiting" && row.inviter_user_id !== user.id
        }
      });
    }
    const row = await currentDuo(db, user.id);
    return json({ duo: row ? await describe(db, row, user.id) : null });
  } catch (routeError) {
    return json({ error: routeError instanceof Error ? routeError.message : "Failed to load the task for two." }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return json({ error }, 401);
    const db = supabase as any;
    const body = (await request.json().catch(() => ({}))) as { action?: string; code?: unknown; note?: unknown };

    if (body.action === "create") {
      const existing = await currentDuo(db, user.id);
      if (existing && existing.status !== "succeeded") return json({ duo: await describe(db, existing, user.id) });
      const { data: row, error: insertError } = await db
        .from("duo_quests")
        .insert({ inviter_user_id: user.id, invite_code: randomBytes(6).toString("hex").slice(0, 10) })
        .select("*")
        .single();
      if (insertError) return json({ error: insertError.message }, 500);
      await recordProductEvent({ entityId: row.id, entityType: "duo_quest", eventName: "duo_created", properties: {}, source: "server", userId: user.id });
      return json({ duo: await describe(db, row, user.id) });
    }

    if (body.action === "join") {
      const code = cleanDuoCode(body.code);
      if (!code) return json({ error: "Invalid invitation." }, 400);
      const { data: row } = await db.from("duo_quests").select("*").eq("invite_code", code).maybeSingle();
      if (!row) return json({ error: "Invitation not found." }, 404);
      if (row.partner_user_id === user.id) return json({ duo: await describe(db, row, user.id) });
      if (row.inviter_user_id === user.id) return json({ error: "This is your own invitation." }, 409);
      if (row.status !== "waiting") return json({ error: "Someone has already joined this invitation." }, 409);
      const mine = await currentDuo(db, user.id);
      if (mine && mine.status === "active") return json({ error: "Finish your current task for two first." }, 409);
      if (mine && mine.status === "waiting") await db.from("duo_quests").update({ status: "ended" }).eq("id", mine.id);
      const { data: joined, error: joinError } = await db
        .from("duo_quests")
        .update({ partner_user_id: user.id, status: "active", started_on: today() })
        .eq("id", row.id)
        .eq("status", "waiting")
        .select("*")
        .maybeSingle();
      if (joinError) return json({ error: joinError.message }, 500);
      if (!joined) return json({ error: "Someone has already joined this invitation." }, 409);
      // Both have the task taken, so the claim works for each of them.
      const challengeId = await duoChallengeId(db);
      if (challengeId) {
        await db.from("user_challenges").upsert(
          [joined.inviter_user_id, user.id].map((userId) => ({ user_id: userId, challenge_id: challengeId, status: "accepted", updated_at: new Date().toISOString() })),
          { onConflict: "user_id,challenge_id", ignoreDuplicates: true }
        );
      }
      await recordProductEvent({ entityId: joined.id, entityType: "duo_quest", eventName: "duo_joined", properties: {}, source: "server", userId: user.id });
      return json({ duo: await describe(db, joined, user.id), challengeId });
    }

    if (body.action === "checkin") {
      const note = cleanDuoNote(body.note);
      if (!note) return json({ error: "Write a few words about your step." }, 400);
      const row = await currentDuo(db, user.id);
      if (!row || row.status !== "active") return json({ error: "No running task for two." }, 409);
      const state = await describe(db, row, user.id);
      if (!state.canCheckIn) return json({ error: "Today is already marked." }, 409);
      const { error: insertError } = await db.from("duo_checkins").insert({ duo_id: row.id, user_id: user.id, day: today(), note });
      if (insertError && insertError.code !== "23505") return json({ error: insertError.message }, 500);
      const after = await describe(db, row, user.id);
      if (after.progress.succeeded) {
        await db.from("duo_quests").update({ status: "succeeded", succeeded_at: new Date().toISOString() }).eq("id", row.id).eq("status", "active");
        after.status = "succeeded";
      }
      await recordProductEvent({ entityId: row.id, entityType: "duo_quest", eventName: "duo_checkin", properties: { day: after.progress.dayIndex + 1, succeeded: after.progress.succeeded }, source: "server", userId: user.id });
      return json({ duo: after });
    }

    if (body.action === "leave") {
      const row = await currentDuo(db, user.id);
      if (row && row.status !== "succeeded") await db.from("duo_quests").update({ status: "ended" }).eq("id", row.id);
      return json({ duo: null });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (routeError) {
    return json({ error: routeError instanceof Error ? routeError.message : "Failed to update the task for two." }, 500);
  }
}
