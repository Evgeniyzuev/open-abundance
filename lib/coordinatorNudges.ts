import { loadParticipantRecords } from "@/lib/coordinatorData";
import { SITE_URL } from "@/lib/guideLocales";
import { buildTelegramNudge, sendTelegramMessage } from "@/lib/telegramBot";
import { DAY2_DEFAULT_LINK, DAY2_EVENT, day2Message, planDay2, type Day2Candidate } from "@/lib/telegramDay2";
import {
  NUDGE_EVENT_TYPE,
  nudgeIdempotencyKey,
  isNudgeSendTime,
  nudgeOutcomes,
  parseNudgeKey,
  planNudges,
  type NudgeHistory,
  type NudgeOutcomes
} from "@/lib/coordinatorNextStep";

type AnyDb = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => any };

const MAX_PER_RUN = 30;

export type NudgeRunSummary = {
  dryRun: boolean;
  participants: number;
  planned: Array<{ user: string; step: string }>;
  sent: number;
  failed: number;
  telegramSent: number;
  telegramSkipped: number;
  /** Per step: nudged people and how many did the step afterwards. */
  outcomes: NudgeOutcomes;
};

/**
 * Finds people stuck on a basic step and queues one push each with a concrete next action.
 * Pacing lives in `planNudges`. Delivery honours each person's "reminders" push preference and
 * only reaches people with an enabled push subscription; the rest see it in the in-app list.
 * With `dryRun` nothing is written.
 */
export async function runCoordinatorNudges(db: AnyDb, options: { dryRun: boolean; now?: number }): Promise<NudgeRunSummary> {
  const now = options.now ?? Date.now();
  const { participants } = await loadParticipantRecords(db, now);

  const { data: pastEvents, error } = await db
    .from("notification_events")
    .select("idempotency_key,created_at")
    .eq("event_type", NUDGE_EVENT_TYPE);
  if (error) throw new Error(error.message);

  const history = new Map<string, NudgeHistory>();
  const sentBefore: Array<{ userId: string; step: string }> = [];
  for (const row of pastEvents ?? []) {
    const parsed = parseNudgeKey(String(row.idempotency_key));
    if (!parsed) continue;
    sentBefore.push({ userId: parsed.userId, step: parsed.step });
    const at = Date.parse(row.created_at);
    const entry = history.get(parsed.userId) ?? { lastAt: 0, steps: new Set<string>(), count: 0 };
    entry.lastAt = Math.max(entry.lastAt, at);
    entry.steps.add(parsed.step);
    entry.count += 1;
    history.set(parsed.userId, entry);
  }

  // Plan wider than one run, then keep the people for whom it is daytime now: the job runs every hour and picks up
  // the others when their morning comes. Pacing in planNudges still guarantees one push per step and person.
  const candidates = planNudges(participants, history, now, MAX_PER_RUN * 8);
  const timezones = await loadTimezones(db, candidates.map((item) => item.userId));
  const planned = candidates.filter((item) => isNudgeSendTime(timezones.get(item.userId), now)).slice(0, MAX_PER_RUN);
  const summary: NudgeRunSummary = {
    dryRun: options.dryRun,
    participants: participants.length,
    planned: planned.map((item) => ({ user: item.userId.slice(0, 8), step: item.step.key })),
    sent: 0,
    failed: 0,
    telegramSent: 0,
    telegramSkipped: 0,
    outcomes: nudgeOutcomes(participants, sentBefore)
  };
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? null;
  if (options.dryRun) return summary;

  for (const { userId, step } of planned) {
    const { error: sendError } = await db.rpc("create_notification_event_raw", {
      p_event_type: NUDGE_EVENT_TYPE,
      p_category: "reminders",
      p_source_type: "coordinator",
      p_source_id: step.key,
      p_title: step.copy.en.title,
      p_body: step.copy.en.body,
      p_deep_link: step.deepLink,
      p_recipient_user_ids: [userId],
      p_idempotency_key: nudgeIdempotencyKey(step.key, userId),
      p_metadata: { step: step.key, copy: step.copy },
      p_push: true
    });
    if (sendError) {
      summary.failed += 1;
      continue;
    }
    summary.sent += 1;
    if (botToken) {
      const result = await sendNudgeToTelegram(db, botToken, userId, step);
      if (result === "sent") summary.telegramSent += 1;
      else summary.telegramSkipped += 1;
    }
  }
  return summary;
}

/**
 * Same nudge in the person's Telegram, only when they have a Telegram account and no enabled web push device (push is
 * preferred where it exists, so nobody gets both) and have not switched "Reminders" push off.
 */
async function sendNudgeToTelegram(
  db: AnyDb,
  botToken: string,
  userId: string,
  step: { deepLink: string; copy: { en: { title: string; body: string } } & Partial<Record<string, { title: string; body: string }>> }
): Promise<"sent" | "skipped"> {
  try {
    const [mapping, devices, preference, profile] = await Promise.all([
      db.from("telegram_accounts").select("telegram_id").eq("user_id", userId).maybeSingle(),
      db.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("owner_key", `user:${userId}`).eq("enabled", true),
      db.from("notification_preferences").select("push_enabled").eq("user_id", userId).eq("category", "reminders").maybeSingle(),
      db.from("user_profiles").select("default_locale").eq("user_id", userId).maybeSingle()
    ]);
    const telegramId = mapping.data?.telegram_id;
    if (!telegramId || (devices.count ?? 0) > 0 || preference.data?.push_enabled === false) return "skipped";
    const message = buildTelegramNudge(step.copy, String(profile.data?.default_locale ?? "en"), step.deepLink, SITE_URL);
    if (!message) return "skipped";
    const result = await sendTelegramMessage(botToken, telegramId, message);
    return result.ok ? "sent" : "skipped";
  } catch {
    return "skipped";
  }
}

/** Saved browser time zones; empty (everyone on the default window) until the column exists and people have opened the app. */
async function loadTimezones(db: AnyDb, userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (userIds.length === 0) return result;
  try {
    const { data, error } = await db.from("user_profiles").select("user_id,timezone").in("user_id", userIds);
    if (error) return result;
    for (const row of data ?? []) if (row.timezone) result.set(row.user_id, String(row.timezone));
  } catch {
    // Treated as "no time zone known".
  }
  return result;
}


export type Day2RunSummary = { candidates: number; sent: number; blocked: number; failed: number; dryRun: boolean };

/**
 * Second-day bot message for people with a linked Telegram account, on by default (TELEGRAM_DAY2_ENABLED=0 turns it
 * off). Runs with the hourly coordinator job; each person gets it once, recorded as a product event.
 */
export async function runTelegramDay2(db: AnyDb, options: { dryRun: boolean; now?: number }): Promise<Day2RunSummary> {
  const now = options.now ?? Date.now();
  const summary: Day2RunSummary = { candidates: 0, sent: 0, blocked: 0, failed: 0, dryRun: options.dryRun };
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? null;
  if (!botToken && !options.dryRun) return summary;

  const since = new Date(now - 72 * 3_600_000).toISOString();
  const { data: profiles, error } = await db.from("user_profiles").select("user_id,created_at,timezone,default_locale").gte("created_at", since).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const ids = (profiles ?? []).map((row: any) => row.user_id);
  if (ids.length === 0) return summary;

  const [accounts, sentEvents, preferences] = await Promise.all([
    db.from("telegram_accounts").select("user_id,telegram_id").in("user_id", ids),
    db.from("product_events").select("user_id").eq("event_name", DAY2_EVENT).in("user_id", ids),
    db.from("notification_preferences").select("user_id,push_enabled").eq("category", "reminders").in("user_id", ids)
  ]);
  if (accounts.error) throw new Error(accounts.error.message);
  const telegramByUser = new Map((accounts.data ?? []).map((row: any) => [row.user_id, row.telegram_id]));
  const candidates: Day2Candidate[] = (profiles ?? [])
    .filter((row: any) => telegramByUser.has(row.user_id))
    .map((row: any) => ({ userId: row.user_id, telegramId: telegramByUser.get(row.user_id), registeredAt: row.created_at, timezone: row.timezone ?? null, locale: row.default_locale ?? null }));
  const alreadySent = new Set<string>((sentEvents.data ?? []).map((row: any) => row.user_id));
  const remindersOff = new Set<string>((preferences.data ?? []).filter((row: any) => row.push_enabled === false).map((row: any) => row.user_id));
  const planned = planDay2(candidates, alreadySent, remindersOff, (timezone, at) => isNudgeSendTime(timezone, at), now);
  summary.candidates = planned.length;
  if (options.dryRun || !botToken) return summary;

  const link = process.env.TELEGRAM_DAY2_LINK?.trim() || DAY2_DEFAULT_LINK;
  for (const person of planned.slice(0, MAX_PER_RUN)) {
    const result = await sendTelegramMessage(botToken, person.telegramId, { ...day2Message(person.locale, link), openAs: "url" });
    if (result.ok) summary.sent += 1;
    else if (result.blocked) summary.blocked += 1;
    else {
      summary.failed += 1;
      continue;
    }
    // Recorded also when the bot is blocked: the person never started the bot, retrying every hour would not help.
    await db.from("product_events").insert({ event_name: DAY2_EVENT, user_id: person.userId, source: "server", properties: { delivered: result.ok } });
  }
  return summary;
}
