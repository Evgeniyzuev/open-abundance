import { loadParticipantRecords } from "@/lib/coordinatorData";
import { SITE_URL } from "@/lib/guideLocales";
import { buildTelegramNudge, sendTelegramMessage } from "@/lib/telegramBot";
import { DAY2_DEEP_LINK, DAY2_EVENT, planDay2, type Day2Candidate } from "@/lib/telegramDay2";
import {
  NEXT_STEPS,
  NUDGE_COOLDOWN_MS,
  NUDGE_EVENT_TYPE,
  fillNudgeCopy,
  nudgeIdempotencyKey,
  isNudgeSendTime,
  nudgeOutcomes,
  parseNudgeKey,
  pickTodayTasks,
  planNudges,
  type NextStepCopy,
  type NudgeHistory,
  type NudgeOutcomes,
  type TaskChallenge,
  type TodayTasks
} from "@/lib/coordinatorNextStep";
import type { Localized } from "@/lib/locales";
import { HOLDOUT_EVENT, isHoldout, type QuestCatalogItem, type QuestNudgeInput, type QuestUserRow } from "@/lib/questNudges";
import { weeklyLeaders } from "@/lib/questLeaders";
import { weekStart } from "@/lib/leadPractices";
import { isQaUser } from "@/lib/qaAccounts";

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
  /** Quest mode (on unless QUEST_NUDGES_ENABLED=0): the path decides the message. */
  questMode: boolean;
  /** Control group: chosen a message, got none (recorded as a product event to compare with). */
  holdout: number;
  /** Per step: nudged people and how many did the step afterwards. */
  outcomes: NudgeOutcomes;
};

/**
 * Picks today's message for each person (Core balance, a basic step, or tasks for today; see `chooseNudge`) and queues
 * it as one notification with a concrete next action. Delivery honours each person's "reminders" push preference and
 * only reaches people with an enabled push subscription or a Telegram account; the rest see it in the in-app list.
 * With `dryRun` nothing is written.
 */
export async function runCoordinatorNudges(db: AnyDb, options: { dryRun: boolean; now?: number; questMode?: boolean }): Promise<NudgeRunSummary> {
  const now = options.now ?? Date.now();
  const questMode = options.questMode === true;
  const participants = (await loadParticipantRecords(db, now)).participants.filter((participant) => !isQaUser(participant.id));

  const [{ data: pastEvents, error }, { data: day2Events, error: day2Error }, { data: holdoutEvents }] = await Promise.all([
    db.from("notification_events").select("idempotency_key,created_at").eq("event_type", NUDGE_EVENT_TYPE),
    db.from("product_events").select("user_id,occurred_at").eq("event_name", DAY2_EVENT),
    db.from("product_events").select("user_id,occurred_at,properties").eq("event_name", HOLDOUT_EVENT)
  ]);
  if (error) throw new Error(error.message);
  if (day2Error) throw new Error(day2Error.message);

  const history = new Map<string, NudgeHistory>();
  const addSend = (userId: string, step: string, at: number) => {
    const entry = history.get(userId) ?? { sends: [] };
    entry.sends.push({ step, at });
    history.set(userId, entry);
  };
  const sentBefore: Array<{ userId: string; step: string; at: number }> = [];
  for (const row of pastEvents ?? []) {
    const parsed = parseNudgeKey(String(row.idempotency_key));
    if (!parsed) continue;
    const at = Date.parse(row.created_at);
    sentBefore.push({ userId: parsed.userId, step: parsed.step, at });
    addSend(parsed.userId, parsed.step, at);
  }
  // The second-day bot message is today's message too, and it is the "tasks for today" text.
  for (const row of day2Events ?? []) if (row.user_id) addSend(row.user_id, "tasks", Date.parse(row.occurred_at));
  // A held-out message counts as sent for the limits, so the control group is paced like everyone else.
  for (const row of holdoutEvents ?? []) if (row.user_id) addSend(row.user_id, String(row.properties?.step ?? "quest_stalled"), Date.parse(row.occurred_at));

  const tasks = await loadTodayTasks(db, participants.map((participant) => participant.id));
  const quests = questMode ? await loadQuestInputs(db, participants.map((participant) => participant.id), now) : null;
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const contextFor = (userId: string) => {
    const lastActiveAt = byId.get(userId)?.lastActiveAt;
    return { tasks: tasks.get(userId) ?? null, lastActiveAt: lastActiveAt ? Date.parse(lastActiveAt) : null, quest: quests?.get(userId) ?? null };
  };

  // Plan wider than one run, then keep the people for whom it is daytime now: the job runs every hour and picks up
  // the others when their morning comes. chooseNudge still guarantees at most one message a day per person.
  const candidates = planNudges(participants, history, now, MAX_PER_RUN * 8, contextFor);
  const profiles = await loadProfiles(db, candidates.map((item) => item.userId));
  const planned = candidates.filter((item) => isNudgeSendTime(profiles.get(item.userId)?.timezone, now)).slice(0, MAX_PER_RUN);
  const summary: NudgeRunSummary = {
    dryRun: options.dryRun,
    participants: participants.length,
    planned: planned.map((item) => ({ user: item.userId.slice(0, 8), step: item.step.key })),
    sent: 0,
    failed: 0,
    telegramSent: 0,
    telegramSkipped: 0,
    questMode,
    holdout: 0,
    outcomes: nudgeOutcomes(participants, sentBefore)
  };
  if (options.dryRun) return summary;
  // Once every push is copied to Telegram (telegram_notification_deliveries), the nudge push already reaches Telegram.
  const pushCopiedToTelegram = !(await db.from("telegram_notification_deliveries").select("id").limit(1)).error;
  const botToken = pushCopiedToTelegram ? null : process.env.TELEGRAM_BOT_TOKEN ?? null;

  for (const { userId, step } of planned) {
    if (questMode && isHoldout(userId)) {
      // Control group: nothing is sent; the event says what would have gone out, for the analytics.
      await db.from("product_events").insert({ event_name: HOLDOUT_EVENT, user_id: userId, source: "server", properties: { step: step.key } });
      summary.holdout += 1;
      continue;
    }
    const participant = byId.get(userId);
    const profile = profiles.get(userId);
    const copy = fillNudgeCopy(step.copy, { name: profile?.name ?? null, core: participant?.coreBalance ?? 0, tasks: tasks.get(userId) ?? null });
    const { error: sendError } = await db.rpc("create_notification_event_raw", {
      p_event_type: NUDGE_EVENT_TYPE,
      p_category: "reminders",
      p_source_type: "coordinator",
      p_source_id: step.key,
      p_title: copy.en.title,
      p_body: copy.en.body,
      p_deep_link: step.deepLink,
      p_recipient_user_ids: [userId],
      p_idempotency_key: nudgeIdempotencyKey(step.key, userId, now),
      p_metadata: { step: step.key, copy },
      p_push: true
    });
    if (sendError) {
      summary.failed += 1;
      continue;
    }
    summary.sent += 1;
    if (botToken) {
      const result = await sendNudgeToTelegram(db, botToken, userId, step.deepLink, copy, profile?.locale ?? "en");
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
  deepLink: string,
  copy: Localized<NextStepCopy>,
  locale: string
): Promise<"sent" | "skipped"> {
  try {
    const [mapping, devices, preference] = await Promise.all([
      db.from("telegram_accounts").select("telegram_id").eq("user_id", userId).maybeSingle(),
      db.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("owner_key", `user:${userId}`).eq("enabled", true),
      db.from("notification_preferences").select("push_enabled").eq("user_id", userId).eq("category", "reminders").maybeSingle()
    ]);
    const telegramId = mapping.data?.telegram_id;
    if (!telegramId || (devices.count ?? 0) > 0 || preference.data?.push_enabled === false) return "skipped";
    const message = buildTelegramNudge(copy, locale, deepLink, SITE_URL);
    if (!message) return "skipped";
    const result = await sendTelegramMessage(botToken, telegramId, message);
    return result.ok ? "sent" : "skipped";
  } catch {
    return "skipped";
  }
}

type ProfileInfo = { name: string | null; locale: string; timezone: string | null };

/** How to address a person: Telegram first name, then the display name, then the nickname. */
function personName(row: { first_name?: string | null; display_name?: string | null; username?: string | null }): string | null {
  return [row.first_name, row.display_name, row.username].map((value) => String(value ?? "").trim()).find(Boolean) ?? null;
}

/** Name, language and saved browser time zone (null until the person has opened the app) per person. */
async function loadProfiles(db: AnyDb, userIds: string[]): Promise<Map<string, ProfileInfo>> {
  const result = new Map<string, ProfileInfo>();
  if (userIds.length === 0) return result;
  const { data, error } = await db.from("user_profiles").select("user_id,first_name,display_name,username,default_locale,timezone").in("user_id", userIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    result.set(row.user_id, { name: personName(row), locale: String(row.default_locale ?? "en"), timezone: row.timezone ? String(row.timezone) : null });
  }
  return result;
}

/** Tasks for today per person: quick challenges they have not finished, up to $10 together (`pickTodayTasks`). */
async function loadTodayTasks(db: AnyDb, userIds: string[]): Promise<Map<string, TodayTasks>> {
  const result = new Map<string, TodayTasks>();
  if (userIds.length === 0) return result;
  const [challenges, done] = await Promise.all([
    db.from("challenges")
      .select("id,sort_order,core_reward_amount,wallet_reward_amount,verification_logic,track_key,track_step,prerequisite_challenge_id,reward_mode,competition_closes_at")
      .eq("is_active", true),
    db.from("user_challenges").select("user_id,challenge_id").eq("status", "completed").in("user_id", userIds)
  ]);
  if (challenges.error) throw new Error(challenges.error.message);
  if (done.error) throw new Error(done.error.message);
  const list: TaskChallenge[] = (challenges.data ?? []).map((row: any) => ({
    id: row.id,
    sortOrder: Number(row.sort_order) || 0,
    coreReward: Number(row.core_reward_amount) || 0,
    walletReward: Number(row.wallet_reward_amount) || 0,
    verificationLogic: row.verification_logic ?? null,
    trackKey: row.track_key ?? null,
    trackStep: row.track_step === null || row.track_step === undefined ? null : Number(row.track_step),
    prerequisiteId: row.prerequisite_challenge_id ?? null,
    rewardMode: row.reward_mode ?? null,
    competitionClosesAt: row.competition_closes_at ?? null
  }));
  const doneByUser = new Map<string, Set<string>>();
  for (const row of done.data ?? []) {
    const set = doneByUser.get(row.user_id) ?? new Set<string>();
    set.add(row.challenge_id);
    doneByUser.set(row.user_id, set);
  }
  for (const userId of userIds) result.set(userId, pickTodayTasks(list, doneByUser.get(userId) ?? new Set()));
  return result;
}

export type Day2RunSummary = { candidates: number; sent: number; blocked: number; failed: number; dryRun: boolean };

/**
 * Second-day bot message for people with a linked Telegram account, on by default (TELEGRAM_DAY2_ENABLED=0 turns it
 * off): "{name}, you have N tasks for today, up to +$X together" with a button to the challenges. Runs with the hourly
 * coordinator job before the daily message; each person gets it once, recorded as a product event, and never on a day
 * they already got a coordinator message.
 */
export async function runTelegramDay2(db: AnyDb, options: { dryRun: boolean; now?: number }): Promise<Day2RunSummary> {
  const now = options.now ?? Date.now();
  const summary: Day2RunSummary = { candidates: 0, sent: 0, blocked: 0, failed: 0, dryRun: options.dryRun };
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? null;
  if (!botToken && !options.dryRun) return summary;

  const since = new Date(now - 72 * 3_600_000).toISOString();
  const { data: profiles, error } = await db.from("user_profiles").select("user_id,created_at,timezone,default_locale,first_name,display_name,username").gte("created_at", since).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const ids = (profiles ?? []).map((row: any) => row.user_id).filter((id: string) => !isQaUser(id));
  if (ids.length === 0) return summary;

  const [accounts, sentEvents, preferences, recentNudges] = await Promise.all([
    db.from("telegram_accounts").select("user_id,telegram_id").in("user_id", ids),
    db.from("product_events").select("user_id").eq("event_name", DAY2_EVENT).in("user_id", ids),
    db.from("notification_preferences").select("user_id,push_enabled").eq("category", "reminders").in("user_id", ids),
    db.from("notification_events").select("idempotency_key").eq("event_type", NUDGE_EVENT_TYPE).gte("created_at", new Date(now - NUDGE_COOLDOWN_MS).toISOString())
  ]);
  if (accounts.error) throw new Error(accounts.error.message);
  const telegramByUser = new Map((accounts.data ?? []).map((row: any) => [row.user_id, row.telegram_id]));
  const candidates: Day2Candidate[] = (profiles ?? [])
    .filter((row: any) => telegramByUser.has(row.user_id))
    .map((row: any) => ({ userId: row.user_id, telegramId: telegramByUser.get(row.user_id), registeredAt: row.created_at, timezone: row.timezone ?? null, locale: row.default_locale ?? null, name: personName(row) }));
  const alreadySent = new Set<string>((sentEvents.data ?? []).map((row: any) => row.user_id));
  const remindersOff = new Set<string>((preferences.data ?? []).filter((row: any) => row.push_enabled === false).map((row: any) => row.user_id));
  const messagedRecently = new Set<string>();
  for (const row of recentNudges.data ?? []) {
    const parsed = parseNudgeKey(String(row.idempotency_key));
    if (parsed) messagedRecently.add(parsed.userId);
  }
  const planned = planDay2(candidates, alreadySent, remindersOff, messagedRecently, (timezone, at) => isNudgeSendTime(timezone, at), now).slice(0, MAX_PER_RUN);
  const tasks = await loadTodayTasks(db, planned.map((person) => person.userId));
  // Nobody is told "0 tasks": without open tasks the person is left to the daily message.
  const withTasks = planned.filter((person) => (tasks.get(person.userId)?.count ?? 0) > 0);
  summary.candidates = withTasks.length;
  if (options.dryRun || !botToken) return summary;

  const link = process.env.TELEGRAM_DAY2_LINK?.trim();
  for (const person of withTasks) {
    const copy = fillNudgeCopy(NEXT_STEPS.tasks.copy, { name: person.name, core: 0, tasks: tasks.get(person.userId) ?? null });
    const message = buildTelegramNudge(copy, person.locale ?? "en", DAY2_DEEP_LINK, SITE_URL);
    if (!message) continue;
    const result = await sendTelegramMessage(botToken, person.telegramId, link ? { ...message, url: link, openAs: "url" } : message);
    if (result.ok) summary.sent += 1;
    else if (result.blocked) summary.blocked += 1;
    else {
      summary.failed += 1;
      continue;
    }
    // Recorded also when the bot is blocked: the person never started the bot, retrying every hour would not help.
    await db.from("product_events").insert({ event_name: DAY2_EVENT, user_id: person.userId, source: "server", properties: { delivered: result.ok, tasks: tasks.get(person.userId)?.count ?? 0 } });
  }
  return summary;
}

/**
 * What Nova needs to know about each person's path: the quest catalogue (path and side quests), their quest rows and
 * their place among the leaders of the week.
 */
async function loadQuestInputs(db: AnyDb, userIds: string[], now: number): Promise<Map<string, QuestNudgeInput>> {
  const result = new Map<string, QuestNudgeInput>();
  if (userIds.length === 0) return result;
  const [catalogRows, userRows] = await Promise.all([
    db.from("challenges").select("id,title,path_order,unlock_at_completed,category,sort_order").eq("is_active", true),
    db.from("user_challenges").select("user_id,challenge_id,status,is_active,updated_at").in("user_id", userIds)
  ]);
  if (catalogRows.error) throw new Error(catalogRows.error.message);
  if (userRows.error) throw new Error(userRows.error.message);
  const catalog: QuestCatalogItem[] = (catalogRows.data ?? []).map((row: any) => ({
    id: row.id,
    title: { ...(row.title ?? {}), en: String(row.title?.en ?? row.title?.ru ?? "") },
    pathOrder: row.path_order ?? null,
    unlockAtCompleted: Number(row.unlock_at_completed ?? 0),
    category: row.category ?? null,
    sortOrder: Number(row.sort_order ?? 0)
  }));
  const onboardingIds = new Set(catalog.filter((quest) => quest.category === "onboarding").map((quest) => quest.id));
  const leaders = weeklyLeaders(((userRows.data ?? []) as any[]).filter((row) => !isQaUser(row.user_id)), onboardingIds, now, 1000);
  const rank = new Map(leaders.map((leader, index) => [leader.userId, { rank: index + 1, quests: leader.quests }]));
  const rowsByUser = new Map<string, QuestUserRow[]>();
  for (const row of userRows.data ?? []) {
    const list = rowsByUser.get(row.user_id) ?? [];
    list.push({ challengeId: row.challenge_id, status: String(row.status ?? "").toLowerCase(), isActive: row.is_active === true, updatedAt: Date.parse(row.updated_at ?? "") || 0 });
    rowsByUser.set(row.user_id, list);
  }
  const leadWeekGoals = await loadLeadWeekGoals(db, userIds, now);
  for (const userId of userIds) {
    result.set(userId, {
      catalog,
      rows: rowsByUser.get(userId) ?? [],
      leaderRank: rank.get(userId)?.rank ?? null,
      weekQuests: rank.get(userId)?.quests ?? 0,
      leadWeekGoalSet: leadWeekGoals.get(userId) ?? null
    });
  }
  return result;
}

/**
 * For people led by the Open Abundance lead (no live lead): whether this week's goal is set. Others and everyone,
 * when the table is not there yet, are left out (null), so Nova does not write about the week to them.
 */
async function loadLeadWeekGoals(db: AnyDb, userIds: string[], now: number): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const [memberships, weeks] = await Promise.all([
    db.from("team_memberships").select("member_user_id,leader_user_id").eq("is_active", true).in("member_user_id", userIds),
    db.from("lead_week_checkins").select("user_id,goal").eq("week_start", weekStart(now)).in("user_id", userIds)
  ]);
  if (memberships.error || weeks.error) return result;
  const withGoal = new Set(((weeks.data ?? []) as any[]).filter((row) => row.goal).map((row) => row.user_id));
  for (const row of (memberships.data ?? []) as any[]) {
    if (!row.leader_user_id) result.set(row.member_user_id, withGoal.has(row.member_user_id));
  }
  return result;
}
