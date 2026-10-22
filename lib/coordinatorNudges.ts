import { loadParticipantRecords } from "@/lib/coordinatorData";
import { SITE_URL } from "@/lib/guideLocales";
import { buildTelegramNudge, sendTelegramMessage } from "@/lib/telegramBot";
import {
  NUDGE_EVENT_TYPE,
  nudgeIdempotencyKey,
  parseNudgeKey,
  planNudges,
  type NudgeHistory
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
  for (const row of pastEvents ?? []) {
    const parsed = parseNudgeKey(String(row.idempotency_key));
    if (!parsed) continue;
    const at = Date.parse(row.created_at);
    const entry = history.get(parsed.userId) ?? { lastAt: 0, steps: new Set<string>(), count: 0 };
    entry.lastAt = Math.max(entry.lastAt, at);
    entry.steps.add(parsed.step);
    entry.count += 1;
    history.set(parsed.userId, entry);
  }

  const planned = planNudges(participants, history, now, MAX_PER_RUN);
  const summary: NudgeRunSummary = {
    dryRun: options.dryRun,
    participants: participants.length,
    planned: planned.map((item) => ({ user: item.userId.slice(0, 8), step: item.step.key })),
    sent: 0,
    failed: 0,
    telegramSent: 0,
    telegramSkipped: 0
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
  step: { deepLink: string; copy: { ru?: { title: string; body: string }; en: { title: string; body: string } } }
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
