import { loadParticipantRecords } from "@/lib/coordinatorData";
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
    failed: 0
  };
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
    if (sendError) summary.failed += 1;
    else summary.sent += 1;
  }
  return summary;
}
