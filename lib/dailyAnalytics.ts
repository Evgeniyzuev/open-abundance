// Daily analytics for the operator and Claude: one Markdown summary plus detail files on request.
// Read-only. Imports are relative so `scripts/daily-analytics.mjs` and the internal route share it.
//
// Privacy rules:
// - The summary holds counts and rates only. No names, usernames, emails or private text.
// - Detail files name people by a stable pseudonym (HMAC of the user id), never by the id itself.
// - Personal attributes (help needs and offers, spending categories, locale, timezone) are shown
//   only for groups of at least MIN_GROUP people; smaller groups are merged into "other".
// - Text leaves the database only where people wrote it for others to read: public wishes,
//   comments on public posts, marketplace listings, and feedback addressed to the team.
import { createHash, createHmac } from "node:crypto";
import {
  buildFunnel,
  buildProposals,
  equityGuard,
  findBottleneck,
  growthComposition,
  NEED_TO_OFFERS,
  summarizeDistribution,
  summarizeSatisfaction,
  type ParticipantRecord,
  type Proposal
} from "./coordinatorAnalysis.ts";
import { guestReview } from "./marketplaceGuestVisibility.ts";
import { buildPathReport } from "./questPathAnalytics.ts";
import { buildReferralReport } from "./referralAnalytics.ts";
import { buildQuestFeedbackReport } from "./questFeedbackAnalytics.ts";
import { isQaUser } from "./qaAccounts.ts";
import { buildWishDemand, rankWishDemand, WISH_KIND_LABEL } from "./wishDemandAnalytics.ts";
import { buildLeadWeekReport, practiceLabel } from "./leadWeekAnalytics.ts";

export const MIN_GROUP = 5;
export const WINDOW_DAYS = 45;
const DAY_MS = 86_400_000;
const PAGE = 1000;

type Row = Record<string, any>;
type AnyDb = { from: (table: string) => any };

export type AnalyticsSnapshot = {
  asOf: string;
  windowDays: number;
  /** Tables that hit their row cap, so counts from them are lower bounds. */
  truncated: string[];
  /** Tables that could not be read (missing migration, renamed column); their sections are empty. */
  missing: string[];
  tables: Record<string, Row[]>;
};

type TableSpec = {
  table: string;
  select: string;
  /** Column limited to the analysis window. */
  since?: string;
  eq?: [string, string];
  cap?: number;
};

export const TABLE_SPECS: TableSpec[] = [
  { table: "user_profiles", select: "user_id,created_at,default_locale,timezone,level,deleted_at,quest_motive,quest_motives" },
  { table: "core_accounts", select: "user_id,balance,level" },
  { table: "wallet_accounts", select: "user_id,balance" },
  {
    table: "user_economy_metrics",
    select: "user_id,core_growth_challenge_rewards,core_growth_leader_bonus,core_growth_reinvest,core_growth_wallet_topups,core_growth_other_system",
    eq: ["period_type", "lifetime"]
  },
  { table: "wishes", select: "id,owner_user_id,title,category,status,visibility,source_recommended_wish_id,target_amount,created_at,completed_at,deleted_at" },
  { table: "recommended_wishes", select: "id,title,category" },
  { table: "skills", select: "id,slug" },
  { table: "user_skills", select: "user_id,skill_id,earned_skill_level,status" },
  { table: "user_help_profiles", select: "user_id,offers,needs,match_consent" },
  { table: "user_spend_intents", select: "user_id,categories,offers_consent" },
  { table: "feed_posts", select: "id,author_user_id,post_type,visibility,status,source_key,repost_of_post_id,created_at,deleted_at", since: "created_at" },
  { table: "feed_post_comments", select: "id,post_id,user_id,body,created_at,deleted_at", since: "created_at" },
  { table: "feed_post_likes", select: "post_id,user_id,created_at", since: "created_at" },
  { table: "challenges", select: "id,title,track_key,category,verification_type,core_reward_amount,wallet_reward_amount,is_active,path_order" },
  { table: "user_challenges", select: "user_id,challenge_id,status,created_at,updated_at,is_active", cap: 50_000 },
  { table: "challenge_feedback_submissions", select: "user_id,status,overall_rating,submitted_at" },
  { table: "challenge_essay_submissions", select: "status,score,submitted_at,reviewed_at" },
  { table: "peer_review_answers", select: "status,created_at,submitted_at", since: "created_at" },
  { table: "referral_edges", select: "referrer_user_id,referral_user_id,claimed_at,source" },
  { table: "humanity_verifications", select: "user_id,humanity_level,verified_at" },
  { table: "referral_rewards", select: "referrer_user_id,referral_user_id,kind,amount,destination,created_at" },
  { table: "marketplace_listings", select: "id,seller_user_id,title,status,price_amount,currency_code,sales_count,metadata,created_at" },
  { table: "marketplace_deals", select: "id,listing_id,buyer_user_id,seller_user_id,status,price_amount,currency_code,created_at,completed_at", since: "created_at" },
  { table: "wallet_ledger", select: "user_id,operation_type,direction,amount,created_at", since: "created_at", cap: 50_000 },
  { table: "product_events", select: "user_id,anonymous_id,event_name,occurred_at,properties", since: "occurred_at", cap: 100_000 },
  { table: "ai_usage_events", select: "user_id,capability,status,created_at", since: "created_at", cap: 50_000 },
  { table: "user_feedback", select: "user_id,category,message,screen,created_at", since: "created_at" },
  { table: "push_subscriptions", select: "owner_key,enabled" },
  { table: "telegram_notification_deliveries", select: "status,created_at,notification_recipients(user_id)", since: "created_at" },
  { table: "direct_messages", select: "sender_user_id,conversation_id,created_at", since: "created_at", cap: 50_000 },
  { table: "user_follows", select: "follower_user_id,followee_user_id,created_at" },
  { table: "team_memberships", select: "member_user_id,leader_user_id,is_active" },
  { table: "lead_meeting_settings", select: "user_id,rhythm" },
  { table: "lead_meetings", select: "user_id,meeting_day,last_goal_status,question,next_goal,created_at", since: "created_at" },
  { table: "word_pledges", select: "user_id,amount,bonus_amount,status,created_at,settled_at", since: "created_at" },
  { table: "lead_week_checkins", select: "user_id,week_start,practice_key,goal,midweek_status,review_status,created_at", since: "created_at" },
  { table: "telegram_accounts", select: "user_id" },
  { table: "notification_events", select: "idempotency_key,created_at", since: "created_at", eq: ["event_type", "coach.next_step"] },
  { table: "coordinator_recommendations", select: "kind,status,source,outcome,created_at,decided_at", since: "created_at" }
];

/** Reads every table in TABLE_SPECS page by page. A table that fails is reported, not fatal. */
export async function loadAnalyticsSnapshot(db: AnyDb, now = Date.now()): Promise<AnalyticsSnapshot> {
  const since = new Date(now - WINDOW_DAYS * DAY_MS).toISOString();
  const snapshot: AnalyticsSnapshot = { asOf: new Date(now).toISOString(), windowDays: WINDOW_DAYS, truncated: [], missing: [], tables: {} };

  await Promise.all(TABLE_SPECS.map(async (spec) => {
    const cap = spec.cap ?? 20_000;
    const rows: Row[] = [];
    for (let from = 0; from < cap; from += PAGE) {
      let query = db.from(spec.table).select(spec.select);
      if (spec.since) query = query.gte(spec.since, since).order(spec.since, { ascending: true });
      if (spec.eq) query = query.eq(spec.eq[0], spec.eq[1]);
      const { data, error } = await query.range(from, Math.min(from + PAGE, cap) - 1);
      if (error) {
        snapshot.missing.push(`${spec.table}: ${error.message}`);
        return;
      }
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE) break;
      if (rows.length >= cap) snapshot.truncated.push(spec.table);
    }
    snapshot.tables[spec.table] = rows.filter((row) => !isQaRow(row));
  }));
  return snapshot;
}

/** A row that belongs to a QA test account (lib/qaAccounts.ts) in any of its person columns. */
function isQaRow(row: Row): boolean {
  for (const [key, value] of Object.entries(row)) {
    if ((key === "user_id" || key.endsWith("_user_id")) && isQaUser(value as string | null)) return true;
  }
  return false;
}

// --- Helpers ------------------------------------------------------------------------------------

/** Secret for pseudonyms: ANALYTICS_PSEUDONYM_SALT, or derived from the service key so the script and the route agree. */
export function analyticsSalt(env: Record<string, string | undefined>): string | null {
  if (env.ANALYTICS_PSEUDONYM_SALT) return env.ANALYTICS_PSEUDONYM_SALT;
  if (env.SUPABASE_SERVICE_ROLE_KEY) return createHash("sha256").update(`oa-analytics:${env.SUPABASE_SERVICE_ROLE_KEY}`).digest("hex");
  return null;
}

export function pseudonymize(userId: string | null | undefined, salt: string): string {
  if (!userId) return "anon";
  return `u_${createHmac("sha256", salt).update(userId).digest("hex").slice(0, 10)}`;
}

const num = (value: unknown) => Number(value) || 0;
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");
const share = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const money = (value: number) => `$${value.toFixed(2)}`;
const titleOf = (value: unknown) => {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.ru ?? record.en ?? Object.values(record)[0] ?? "");
  }
  return String(value ?? "");
};
const clip = (text: unknown, length = 280) => {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
};

function table(header: string[], rows: Array<Array<string | number>>): string {
  if (rows.length === 0) return "_нет данных_";
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\|/g, "/")).join(" | ")} |`)
  ].join("\n");
}

/** Counts distinct people per label and merges labels below the group minimum into one line. */
export function groupPeople(pairs: Array<[string, string]>, minGroup = MIN_GROUP): Array<[string, number]> {
  const groups = new Map<string, Set<string>>();
  for (const [label, person] of pairs) {
    if (!label) continue;
    const set = groups.get(label) ?? new Set<string>();
    set.add(person);
    groups.set(label, set);
  }
  const shown: Array<[string, number]> = [];
  const hidden = new Set<string>();
  let hiddenLabels = 0;
  for (const [label, people] of groups) {
    if (people.size >= minGroup) shown.push([label, people.size]);
    else {
      hiddenLabels += 1;
      people.forEach((person) => hidden.add(person));
    }
  }
  shown.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (hiddenLabels > 0) shown.push([`другое (${hiddenLabels} мелких групп)`, hidden.size]);
  return shown;
}

function countBy<T>(items: T[], key: (item: T) => string | null | undefined): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value) map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// --- Participants (same shape as the coordinator digest) ---------------------------------------

export function participantsFromSnapshot(snapshot: AnalyticsSnapshot, now: number): ParticipantRecord[] {
  const t = snapshot.tables;
  const count = (rows: Row[] | undefined, key: string, keep: (row: Row) => boolean = () => true) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) if (row[key] && keep(row)) map.set(row[key], (map.get(row[key]) ?? 0) + 1);
    return map;
  };
  const wishes = count(t.wishes, "owner_user_id", (row) => !row.deleted_at);
  const posts = count(t.feed_posts, "author_user_id", (row) => !row.source_key && !row.repost_of_post_id && !row.deleted_at && row.status === "published");
  const ai = count(t.ai_usage_events, "user_id", (row) => row.capability === "chat.general" && row.status === "accepted");
  const accepted = count(t.user_challenges, "user_id", (row) => row.status === "accepted" || row.status === "completed");
  const completed = count(t.user_challenges, "user_id", (row) => row.status === "completed");
  const feedback = count(t.challenge_feedback_submissions, "user_id", (row) => row.status === "submitted");
  const referrals = count(t.referral_edges, "referrer_user_id");
  const balances = new Map<string, number>((t.core_accounts ?? []).map((row) => [row.user_id, num(row.balance)]));
  const growth = new Map<string, ParticipantRecord["coreGrowth"]>();
  for (const row of t.user_economy_metrics ?? []) {
    const value = growth.get(row.user_id) ?? { challengeRewards: 0, leaderBonus: 0, reinvest: 0, walletTopups: 0, otherSystem: 0 };
    value.challengeRewards += num(row.core_growth_challenge_rewards);
    value.leaderBonus += num(row.core_growth_leader_bonus);
    value.reinvest += num(row.core_growth_reinvest);
    value.walletTopups += num(row.core_growth_wallet_topups);
    value.otherSystem += num(row.core_growth_other_system);
    growth.set(row.user_id, value);
  }
  const help = new Map<string, ParticipantRecord["helpProfile"]>(
    (t.user_help_profiles ?? []).map((row) => [row.user_id, { offers: row.offers ?? [], needs: row.needs ?? [], consent: Boolean(row.match_consent) }])
  );

  const activity = new Map<string, { stories: Set<string>; calculator: boolean; shares: number; outcomes: string[]; checkin: string | null; dates: Set<string> }>();
  for (const event of t.product_events ?? []) {
    if (!event.user_id) continue;
    let entry = activity.get(event.user_id);
    if (!entry) {
      entry = { stories: new Set(), calculator: false, shares: 0, outcomes: [], checkin: null, dates: new Set() };
      activity.set(event.user_id, entry);
    }
    const props = event.properties && typeof event.properties === "object" ? event.properties : {};
    if (event.event_name === "app_open") entry.dates.add(String(event.occurred_at).slice(0, 10));
    else if (event.event_name === "feed_post_impression") entry.stories.add(String(props.post_id ?? event.occurred_at));
    else if (event.event_name === "core_calculator_mode_selected") entry.calculator = true;
    else if (event.event_name === "feed_post_shared_external") entry.shares += 1;
    else if (event.event_name === "wish_outcome_answered" && typeof props.answer === "string") entry.outcomes.push(props.answer);
    else if (event.event_name === "self_serve_checkin_answered" && !entry.checkin && typeof props.answer === "string") entry.checkin = props.answer;
  }

  return (t.user_profiles ?? []).filter((profile) => !profile.deleted_at).map((profile): ParticipantRecord => {
    const id: string = profile.user_id;
    const registeredMs = Date.parse(profile.created_at);
    const registeredDate = new Date(registeredMs).toISOString().slice(0, 10);
    const entry = activity.get(id);
    const returnedDay2 = now - registeredMs < 2 * DAY_MS
      ? null
      : [...(entry?.dates ?? [])].some((date) => date > registeredDate && Date.parse(date) - Date.parse(registeredDate) <= 3 * DAY_MS);
    return {
      id,
      registeredAt: profile.created_at,
      coreBalance: balances.get(id) ?? 0,
      coreGrowth: growth.get(id) ?? { challengeRewards: 0, leaderBonus: 0, reinvest: 0, walletTopups: 0, otherSystem: 0 },
      storiesViewed: entry?.stories.size ?? 0,
      wishes: wishes.get(id) ?? 0,
      calculatorUsed: entry?.calculator ?? false,
      challengesAccepted: accepted.get(id) ?? 0,
      challengesCompleted: completed.get(id) ?? 0,
      feedbackSubmitted: feedback.get(id) ?? 0,
      novaMessages: ai.get(id) ?? 0,
      returnedDay2,
      contentPosts: posts.get(id) ?? 0,
      externalShares: entry?.shares ?? 0,
      referralsInvited: referrals.get(id) ?? 0,
      helpProfile: help.get(id) ?? null,
      outcomeAnswers: entry?.outcomes ?? [],
      checkinAnswer: entry?.checkin ?? null
    };
  });
}

// --- Personal next step ------------------------------------------------------------------------

export type NextStep =
  | "return_gently"
  | "add_first_wish"
  | "first_challenge"
  | "smaller_step"
  | "match_helper"
  | "invite_friend"
  | "ask_survey"
  | "keep_going";

export const NEXT_STEP_LABELS: Record<NextStep, string> = {
  return_gently: "не заходил 7+ дней: одно тёплое сообщение о новом в его желании",
  add_first_wish: "нет желания: помочь записать одно",
  first_challenge: "есть желание, нет задания: предложить один маленький челлендж",
  smaller_step: "взял задание и застрял 3+ дня: предложить шаг поменьше",
  match_helper: "согласен на знакомства: предложить пару по тегам",
  invite_friend: "есть результат: предложить пригласить одного человека",
  ask_survey: "активен, ни разу не отвечал на вопросы: короткий опрос",
  keep_going: "всё идёт: не трогать, только поздравления по факту"
};

/** One next step per person, by a fixed ladder. Text for the person is written later, by people or Claude, and sent only after approval. */
export function nextStepFor(participant: ParticipantRecord, signals: { lastActiveMs: number | null; stalledChallenge: boolean }, now: number): NextStep {
  if (signals.lastActiveMs !== null && now - signals.lastActiveMs > 7 * DAY_MS) return "return_gently";
  if (participant.wishes === 0) return "add_first_wish";
  if (signals.stalledChallenge) return "smaller_step";
  if (participant.challengesAccepted === 0) return "first_challenge";
  if (participant.helpProfile?.consent && participant.helpProfile.needs.length > 0) return "match_helper";
  if (participant.challengesCompleted >= 1 && participant.referralsInvited === 0) return "invite_friend";
  if (participant.outcomeAnswers.length === 0 && !participant.checkinAnswer) return "ask_survey";
  return "keep_going";
}

// --- Report ------------------------------------------------------------------------------------

export type DailyReport = {
  summary: string;
  /** Flat numbers for day-over-day comparison. */
  metrics: Record<string, number>;
  details: Record<string, unknown>;
};

export const DELTAS_PLACEHOLDER = "<!-- deltas -->";

export function buildDailyReport(snapshot: AnalyticsSnapshot, options: { salt: string; now?: number; minGroup?: number }): DailyReport {
  const now = options.now ?? Date.parse(snapshot.asOf);
  const minGroup = options.minGroup ?? MIN_GROUP;
  const salt = options.salt;
  const t = snapshot.tables;
  const p = (id: string | null | undefined) => pseudonymize(id, salt);
  const within = (iso: unknown, days: number) => typeof iso === "string" && now - Date.parse(iso) <= days * DAY_MS && Date.parse(iso) <= now;
  const dateKey = new Date(now).toISOString().slice(0, 10);
  const metrics: Record<string, number> = {};
  const details: Record<string, unknown> = {};
  const out: string[] = [];

  const profiles = (t.user_profiles ?? []).filter((row) => !row.deleted_at);
  const participants = participantsFromSnapshot(snapshot, now);
  const events = t.product_events ?? [];

  // Activity from any event, by account or guest id.
  const actor = (event: Row) => event.user_id ?? (event.anonymous_id ? `g:${event.anonymous_id}` : null);
  const activeIn = (days: number, accountsOnly = false) => new Set(
    events.filter((event) => within(event.occurred_at, days) && (!accountsOnly || event.user_id)).map(actor).filter(Boolean)
  ).size;
  const lastActive = new Map<string, number>();
  for (const event of events) {
    if (!event.user_id) continue;
    const at = Date.parse(event.occurred_at);
    if (at > (lastActive.get(event.user_id) ?? 0)) lastActive.set(event.user_id, at);
  }

  metrics.users_total = profiles.length;
  metrics.users_new_1d = profiles.filter((row) => within(row.created_at, 1)).length;
  metrics.users_new_7d = profiles.filter((row) => within(row.created_at, 7)).length;
  metrics.active_accounts_1d = activeIn(1, true);
  metrics.active_accounts_7d = activeIn(7, true);
  metrics.active_accounts_30d = activeIn(30, true);
  metrics.active_all_1d = activeIn(1);
  metrics.active_all_7d = activeIn(7);

  // Notification reach, the key number while channels are thin (Evgen, 2026-10-27): active people a push or the
  // Telegram bot actually reaches. The bot counts when its latest copy to the person was delivered, not blocked.
  const pushUsers = new Set((t.push_subscriptions ?? []).filter((row) => row.enabled && String(row.owner_key ?? "").startsWith("user:"))
    .map((row) => String(row.owner_key).slice(5)).filter((id) => !isQaUser(id)));
  const latestBot = new Map<string, { at: number; status: string }>();
  for (const row of t.telegram_notification_deliveries ?? []) {
    const userId = row.notification_recipients?.user_id as string | undefined;
    if (!userId || isQaUser(userId) || (row.status !== "sent" && row.status !== "blocked")) continue;
    const at = Date.parse(row.created_at);
    if (at > (latestBot.get(userId)?.at ?? 0)) latestBot.set(userId, { at, status: row.status });
  }
  const botUsers = new Set([...latestBot].filter(([, value]) => value.status === "sent").map(([userId]) => userId));
  const active7 = new Set(events.filter((event) => event.user_id && within(event.occurred_at, 7)).map((event) => event.user_id as string));
  const reachable = new Set([...pushUsers, ...botUsers]);
  metrics.notify_push_users = pushUsers.size;
  metrics.notify_bot_delivered_users = botUsers.size;
  metrics.notify_bot_blocked_users = [...latestBot.values()].filter((value) => value.status === "blocked").length;
  metrics.notify_reach_active_7d = [...active7].filter((userId) => reachable.has(userId)).length;

  out.push(`# Ежедневная сводка Open Abundance — ${dateKey}`);
  out.push("");
  out.push(`Снимок на ${snapshot.asOf}. Окно событий ${snapshot.windowDays} дней. Группы личных признаков меньше ${minGroup} человек объединены в «другое». Люди в файлах деталей названы псевдонимами.`);
  if (snapshot.truncated.length) out.push(`\n⚠️ Упёрлись в лимит строк (цифры — нижняя граница): ${snapshot.truncated.join(", ")}.`);
  if (snapshot.missing.length) out.push(`\n⚠️ Не прочитаны таблицы (раздел пустой): ${snapshot.missing.join("; ")}.`);
  out.push("");
  out.push(DELTAS_PLACEHOLDER);

  // 1. Pulse
  out.push("\n## 1. Пульс");
  out.push(table(["Показатель", "Значение"], [
    ["Аккаунтов всего", metrics.users_total],
    ["Новых за сутки / 7 дней", `${metrics.users_new_1d} / ${metrics.users_new_7d}`],
    ["Активных аккаунтов за сутки / 7 / 30 дней", `${metrics.active_accounts_1d} / ${metrics.active_accounts_7d} / ${metrics.active_accounts_30d}`],
    ["Активных вместе с гостями за сутки / 7 дней", `${metrics.active_all_1d} / ${metrics.active_all_7d}`],
    ["Залипание (активные за сутки / за 30 дней)", pct(metrics.active_accounts_1d, metrics.active_accounts_30d)],
    ["**Охват уведомлениями**: активных за 7 дней, до кого доходит пуш или бот", `${metrics.notify_reach_active_7d} из ${metrics.active_accounts_7d} (${pct(metrics.notify_reach_active_7d, metrics.active_accounts_7d)})`],
    ["Пуш включён / бот доставляет / бот заблокирован (людей)", `${metrics.notify_push_users} / ${metrics.notify_bot_delivered_users} / ${metrics.notify_bot_blocked_users}`]
  ]));

  // 2. Funnel
  const funnel = buildFunnel(participants);
  const bottleneck = findBottleneck(participants);
  const onboarding = ["onboarding_viewed", "onboarding_step_viewed", "onboarding_auth_started", "onboarding_auth_email_sent", "onboarding_completed"].map((name) => {
    const people = new Set(events.filter((event) => event.event_name === name && within(event.occurred_at, 30)).map(actor).filter(Boolean)).size;
    metrics[`onb_${name}_30d`] = people;
    return [name, people] as [string, number];
  });
  out.push("\n## 2. Воронка");
  out.push("Онбординг за 30 дней (люди, включая гостей):");
  out.push(table(["Шаг", "Людей"], onboarding));
  out.push("\nПуть участника (от тех, к кому шаг применим):");
  out.push(table(["Шаг", "Сделали", "Из", "Доля"], funnel.map((stage) => {
    metrics[`funnel_${stage.key}`] = stage.users;
    return [stage.key, stage.users, stage.eligible, pct(stage.users, stage.eligible)];
  })));
  out.push(bottleneck
    ? `\nСамое узкое место: **${bottleneck.from} → ${bottleneck.to}** — дошли ${bottleneck.passed} из ${bottleneck.reached} (${pct(bottleneck.passed, bottleneck.reached)}).`
    : "\nУзкое место не определено: на каждом шаге меньше 3 человек.");

  // 3. Movements
  const eventCounts = (days: number) => countBy(events.filter((event) => within(event.occurred_at, days)), (event) => event.event_name);
  const counts1 = new Map(eventCounts(1));
  const counts7 = eventCounts(7);
  out.push("\n## 3. Движения людей (события продукта)");
  out.push(table(["Событие", "За сутки", "За 7 дней"], counts7.slice(0, 25).map(([name, value]) => [name, counts1.get(name) ?? 0, value])));
  details.events_7d = counts7;
  const hours = countBy(events.filter((event) => within(event.occurred_at, 7) && event.user_id), (event) => String(new Date(event.occurred_at).getUTCHours()).padStart(2, "0"));
  if (hours.length) out.push(`\nСамые активные часы (UTC, 7 дней): ${hours.slice(0, 3).map(([hour, value]) => `${hour}:00 (${value})`).join(", ")}.`);

  // 4. Wishes
  const wishes = (t.wishes ?? []).filter((row) => !row.deleted_at);
  const recommended = new Map((t.recommended_wishes ?? []).map((row) => [row.id, titleOf(row.title)]));
  metrics.wishes_total = wishes.length;
  metrics.wishes_new_7d = wishes.filter((row) => within(row.created_at, 7)).length;
  metrics.wishes_completed_7d = wishes.filter((row) => within(row.completed_at, 7)).length;
  metrics.wishes_completed_total = wishes.filter((row) => row.status === "completed").length;
  const withMoney = wishes.filter((row) => num(row.target_amount) > 0);
  out.push("\n## 4. Желания");
  out.push(table(["Показатель", "Значение"], [
    ["Всего активных и выполненных", metrics.wishes_total],
    ["Новых за 7 дней", metrics.wishes_new_7d],
    ["Выполнено за 7 дней / всего", `${metrics.wishes_completed_7d} / ${metrics.wishes_completed_total}`],
    ["С целевой суммой (медиана)", withMoney.length ? `${withMoney.length} (${money(summarizeDistribution(withMoney.map((row) => num(row.target_amount))).median)})` : "0"],
    ["Публичных", wishes.filter((row) => row.visibility === "public").length]
  ]));
  const categories = groupPeople(wishes.map((row) => [row.category || "без категории", row.owner_user_id]), minGroup);
  out.push("\nКатегории (люди):");
  out.push(table(["Категория", "Людей"], categories));
  const copied = countBy(wishes.filter((row) => row.source_recommended_wish_id), (row) => recommended.get(row.source_recommended_wish_id) || "рекомендованное");
  if (copied.length) out.push(`\nЧаще всего берут из рекомендованных: ${copied.slice(0, 5).map(([title, value]) => `«${title}» (${value})`).join(", ")}.`);
  // What to fulfil first: most common wishes and how many owners can start them now.
  const coreByUser = new Map<string, number>((t.core_accounts ?? []).map((row) => [row.user_id, num(row.balance)]));
  const demand = buildWishDemand({ wishes, recommendedTitles: recommended, balances: coreByUser });
  const smallOwn = demand.filter((row) => row.kind === "own_category" && row.people < minGroup);
  const demandShown = rankWishDemand(demand.filter((row) => !smallOwn.includes(row)));
  if (smallOwn.length) {
    demandShown.push({
      label: `свои: другое (${smallOwn.length} мелких групп)`, kind: "own_category",
      people: smallOwn.reduce((sum, row) => sum + row.people, 0), medianPrice: null, level: 0,
      readyNow: smallOwn.reduce((sum, row) => sum + row.readyNow, 0), completed: smallOwn.reduce((sum, row) => sum + row.completed, 0)
    });
  }
  out.push("\nЧто проще исполнять первым (у скольких владельцев уровень Core уже покрывает цену или желание без денег):");
  out.push(table(["Желание", "Вид", "Людей", "Медиана цены", "Уровень", "Можно начать сейчас", "Исполнено"], demandShown.slice(0, 12).map((row) => [
    row.label, WISH_KIND_LABEL[row.kind], row.people, row.medianPrice === null ? "без денег" : money(row.medianPrice), row.level, row.readyNow, row.completed
  ])));
  const smallEvents = (name: string) => events.filter((event) => event.event_name === name && within(event.occurred_at, 7));
  metrics.small_wish_offer_shown_7d = new Set(smallEvents("small_wish_offer_shown").map((event) => event.user_id).filter(Boolean)).size;
  metrics.small_wish_added_7d = smallEvents("small_wish_added").length;
  metrics.small_wish_dismissed_7d = smallEvents("small_wish_offer_dismissed").length;
  const addedKinds = countBy(smallEvents("small_wish_added"), (event) => String(event.properties?.kind ?? ""));
  out.push(`\nМаленькие желания за 7 дней: карточку видели ${metrics.small_wish_offer_shown_7d} чел., взяли ${metrics.small_wish_added_7d}${addedKinds.length ? ` (${addedKinds.map(([kind, value]) => `${kind} ${value}`).join(", ")})` : ""}, отложили ${metrics.small_wish_dismissed_7d}.`);
  details.wish_demand = rankWishDemand(demand.filter((row) => row.kind !== "own_category"));
  details.public_wishes = wishes.filter((row) => row.visibility === "public").map((row) => ({
    person: p(row.owner_user_id), title: clip(row.title, 140), category: row.category, status: row.status, target_amount: row.target_amount, created_at: row.created_at
  }));

  // 5. Skills and matches
  const skillSlug = new Map((t.skills ?? []).map((row) => [row.id, row.slug]));
  const userSkills = t.user_skills ?? [];
  out.push("\n## 5. Навыки и совпадения");
  const skillRows = countBy(userSkills.filter((row) => num(row.earned_skill_level) > 0), (row) => skillSlug.get(row.skill_id) ?? "unknown").map(([slug, value]) => {
    const verified = userSkills.filter((row) => skillSlug.get(row.skill_id) === slug && row.status === "verified").length;
    return [slug, value, verified] as [string, number, number];
  });
  out.push(table(["Навык", "Людей с уровнем > 0", "Подтверждено"], skillRows.slice(0, 15)));
  const helpProfiles = t.user_help_profiles ?? [];
  const consented = helpProfiles.filter((row) => row.match_consent);
  metrics.match_consented = consented.length;
  const offers = groupPeople(helpProfiles.flatMap((row) => (row.offers ?? []).map((tag: string) => [tag, row.user_id] as [string, string])), minGroup);
  const needs = groupPeople(helpProfiles.flatMap((row) => (row.needs ?? []).map((tag: string) => [tag, row.user_id] as [string, string])), minGroup);
  out.push(`\nАнкет «могу помочь / нужна помощь»: ${helpProfiles.length}, согласны на знакомства: ${consented.length}.`);
  out.push(table(["Нужно (люди)", ""], needs));
  out.push(table(["Предлагают (люди)", ""], offers));
  const offerTags = new Set(helpProfiles.flatMap((row) => row.offers ?? []));
  const unmetNeeds = needs.filter(([tag]) => !tag.startsWith("другое") && !offerTags.has(tag) && !(NEED_TO_OFFERS[tag] ?? []).some((offer) => offerTags.has(offer)));
  if (unmetNeeds.length) out.push(`\nСпрос без предложения: ${unmetNeeds.map(([tag, value]) => `${tag} (${value})`).join(", ")} — кандидаты на обучающий трек или закупку услуги.`);
  const matches = buildProposals(participants, dateKey, now).filter((proposal) => proposal.kind === "match");
  metrics.match_pairs_possible = matches.length;
  out.push(`Возможных пар по согласию сегодня: ${matches.length}.`);

  // 6. Feed and comments
  const posts = (t.feed_posts ?? []).filter((row) => !row.deleted_at && row.status === "published");
  const ownPosts = posts.filter((row) => !row.source_key && !row.repost_of_post_id && row.author_user_id);
  const comments = (t.feed_post_comments ?? []).filter((row) => !row.deleted_at);
  const likes = t.feed_post_likes ?? [];
  metrics.posts_7d = ownPosts.filter((row) => within(row.created_at, 7)).length;
  metrics.comments_7d = comments.filter((row) => within(row.created_at, 7)).length;
  metrics.likes_7d = likes.filter((row) => within(row.created_at, 7)).length;
  metrics.dm_7d = (t.direct_messages ?? []).filter((row) => within(row.created_at, 7)).length;
  metrics.follows_7d = (t.user_follows ?? []).filter((row) => within(row.created_at, 7)).length;
  out.push("\n## 6. Лента, комментарии, связи");
  out.push(table(["За 7 дней", "Значение"], [
    ["Постов участников", metrics.posts_7d],
    ["Авторов постов", new Set(ownPosts.filter((row) => within(row.created_at, 7)).map((row) => row.author_user_id)).size],
    ["Комментариев / комментаторов", `${metrics.comments_7d} / ${new Set(comments.filter((row) => within(row.created_at, 7)).map((row) => row.user_id)).size}`],
    ["Лайков", metrics.likes_7d],
    ["Личных сообщений (без текста) / диалогов", `${metrics.dm_7d} / ${new Set((t.direct_messages ?? []).filter((row) => within(row.created_at, 7)).map((row) => row.conversation_id)).size}`],
    ["Новых подписок", metrics.follows_7d]
  ]));
  out.push(`\nТипы постов за 7 дней: ${countBy(posts.filter((row) => within(row.created_at, 7)), (row) => row.post_type).map(([type, value]) => `${type} ${value}`).join(", ") || "нет"}.`);
  const publicPost = new Map(posts.filter((row) => row.visibility === "public").map((row) => [row.id, row]));
  details.public_comments_7d = comments.filter((row) => within(row.created_at, 7) && publicPost.has(row.post_id)).map((row) => ({
    person: p(row.user_id), post_id: row.post_id, post_type: publicPost.get(row.post_id)?.post_type, body: clip(row.body), created_at: row.created_at
  }));

  // 6a. Leads and the week with the Open Abundance lead
  const leadWeek = buildLeadWeekReport({
    memberships: t.team_memberships ?? [],
    checkins: t.lead_week_checkins ?? [],
    userChallenges: t.user_challenges ?? [],
    events,
    now
  });
  metrics.lead_live_led = leadWeek.liveLed;
  metrics.lead_oa_led = leadWeek.oaLed;
  metrics.lead_week_goals = leadWeek.thisWeek.goals;
  metrics.lead_week_reviews = leadWeek.thisWeek.reviews;
  out.push("\n### Лиды и неделя с лидом Open Abundance");
  out.push(table(["Показатель", "Значение"], [
    ["Ведёт живой лид / лид Open Abundance (людей)", `${leadWeek.liveLed} / ${leadWeek.oaLed}`],
    ["Цель на эту неделю поставили (из них ведёт лид OA)", `${leadWeek.thisWeek.goals} (${leadWeek.thisWeek.goalsOaLed})`],
    ["Ответили в середине недели / подвели итог / «сделал»", `${leadWeek.thisWeek.midweek} / ${leadWeek.thisWeek.reviews} / ${leadWeek.thisWeek.done}`],
    ["Живые лиды скопировали набор недели (7 дней)", leadWeek.kitCopies7d]
  ]));
  const meetingSettings = t.lead_meeting_settings ?? [];
  const meetings7d = (t.lead_meetings ?? []).filter((row) => within(row.created_at, 7));
  metrics.lead_meetings_7d = meetings7d.length;
  metrics.lead_meeting_people_7d = new Set(meetings7d.map((row) => row.user_id)).size;
  const rhythms = countBy(meetingSettings, (row) => row.rhythm);
  const goalStatuses = countBy(meetings7d.filter((row) => row.last_goal_status), (row) => row.last_goal_status);
  out.push(`\nВстречи с лидом: ритм выбрали ${meetingSettings.length} чел. (${rhythms.map(([rhythm, value]) => `${rhythm} ${value}`).join(", ") || "—"}); за 7 дней встреч ${meetings7d.length} у ${metrics.lead_meeting_people_7d} чел., с вопросом ${meetings7d.filter((row) => row.question).length}, с целью на следующую ${meetings7d.filter((row) => row.next_goal).length}; прошлая цель: ${goalStatuses.map(([status, value]) => `${status} ${value}`).join(", ") || "—"}.`);
  const pledges7d = (t.word_pledges ?? []).filter((row) => within(row.created_at, 7));
  const pledgeSum = (rows: typeof pledges7d, key: string) => rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0).toFixed(2);
  const kept = pledges7d.filter((row) => row.status === "kept");
  const missed = pledges7d.filter((row) => row.status === "missed");
  metrics.word_pledges_7d = pledges7d.length;
  out.push(`Цена слова за 7 дней: дали слово ${pledges7d.length} раз (залог $${pledgeSum(pledges7d, "amount")}); сдержали ${kept.length} (бонус в Core $${pledgeSum(kept, "bonus_amount")}), не успели ${missed.length} (в фонд наград $${pledgeSum(missed, "amount")}), идут ${pledges7d.filter((row) => row.status === "active").length}.`);
  if (leadWeek.practices.length) {
    out.push("\nПрактики за окно (недели с целью; «сделал» и квесты за неделю, сравнивать с контролем):");
    out.push(table(["Практика", "Недель", "Сделал", "Частично", "Медиана квестов за неделю"], leadWeek.practices.map((row) => [
      practiceLabel(row.practice), row.weeks, `${row.done} (${pct(row.done, row.weeks)})`, row.partly, row.medianQuests
    ])));
  }

  // 7. Challenges and verification
  const challenges = new Map((t.challenges ?? []).map((row) => [row.id, row]));
  const userChallenges = t.user_challenges ?? [];
  const stalled = userChallenges.filter((row) => row.status === "accepted" && now - Date.parse(row.updated_at ?? row.created_at) > 3 * DAY_MS);
  metrics.challenges_completed_7d = userChallenges.filter((row) => row.status === "completed" && within(row.updated_at, 7)).length;
  metrics.challenges_accepted_7d = userChallenges.filter((row) => within(row.created_at, 7)).length;
  metrics.challenges_stalled = stalled.length;
  const perChallenge = new Map<string, { accepted: number; completed: number; stalled: number }>();
  for (const row of userChallenges) {
    const entry = perChallenge.get(row.challenge_id) ?? { accepted: 0, completed: 0, stalled: 0 };
    entry.accepted += 1;
    if (row.status === "completed") entry.completed += 1;
    perChallenge.set(row.challenge_id, entry);
  }
  for (const row of stalled) perChallenge.get(row.challenge_id)!.stalled += 1;
  const challengeRows = [...perChallenge.entries()]
    .map(([id, value]) => {
      const challenge = challenges.get(id);
      return { id, title: clip(titleOf(challenge?.title) || id, 60), track: challenge?.track_key ?? "-", verification: challenge?.verification_type ?? "-", ...value };
    })
    .sort((a, b) => b.accepted - a.accepted);
  const peer = t.peer_review_answers ?? [];
  const checkFailures = events.filter((event) => event.event_name.includes("check_failed") && within(event.occurred_at, 7)).length;
  out.push("\n## 7. Челленджи и проверка заданий");
  out.push(table(["За 7 дней", "Значение"], [
    ["Взято / выполнено", `${metrics.challenges_accepted_7d} / ${metrics.challenges_completed_7d}`],
    ["Застряли (взято, нет движения 3+ дня)", metrics.challenges_stalled],
    ["Очередь взаимной проверки: предложено / принято / сдано", `${peer.filter((row) => row.status === "offered").length} / ${peer.filter((row) => row.status === "accepted").length} / ${peer.filter((row) => row.status === "submitted").length}`],
    ["Неудачных автопроверок (события *check_failed*)", checkFailures],
    ["Ответов на проверке ИИ / вернули на доработку / оценено (ср. %)", (() => {
      const essays = t.challenge_essay_submissions ?? [];
      const scored = essays.filter((row) => row.status === "scored");
      metrics.essays_pending = essays.filter((row) => row.status === "submitted").length;
      const mean = scored.length ? Math.round(scored.reduce((sum, row) => sum + num(row.score), 0) / scored.length) : null;
      return `${metrics.essays_pending} / ${essays.filter((row) => row.status === "needs_work").length} / ${scored.length}${mean === null ? "" : ` (${mean}%)`}`;
    })()],
    ["Отзывов о челленджах (оценка)", `${(t.challenge_feedback_submissions ?? []).filter((row) => row.status === "submitted").length} (ср. ${(() => {
      const ratings = (t.challenge_feedback_submissions ?? []).map((row) => num(row.overall_rating)).filter(Boolean);
      return ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "—";
    })()})`]
  ]));
  out.push("\nТоп челленджей:");
  out.push(table(["Челлендж", "Трек", "Проверка", "Взяли", "Выполнили", "Застряли"], challengeRows.slice(0, 12).map((row) => [row.title, row.track, row.verification, row.accepted, `${row.completed} (${pct(row.completed, row.accepted)})`, row.stalled])));
  details.challenges = challengeRows;

  // 8. Referrals and humanity
  const referralsRows = t.referral_edges ?? [];
  const humanity = new Map((t.humanity_verifications ?? []).map((row) => [row.user_id, num(row.humanity_level)]));
  metrics.referrals_total = referralsRows.length;
  metrics.referrals_7d = referralsRows.filter((row) => within(row.claimed_at, 7)).length;
  metrics.referrals_verified = referralsRows.filter((row) => (humanity.get(row.referral_user_id) ?? 0) >= 2).length;
  metrics.humanity_l2 = [...humanity.values()].filter((level) => level >= 2).length;
  out.push("\n## 8. Рефералы и проверка человечности");
  out.push(table(["Показатель", "Значение"], [
    ["Приглашённых всего / за 7 дней", `${metrics.referrals_total} / ${metrics.referrals_7d}`],
    ["Из них прошли проверку (уровень ≥ 2)", `${metrics.referrals_verified} (${pct(metrics.referrals_verified, metrics.referrals_total)})`],
    ["Приглашающих", new Set(referralsRows.map((row) => row.referrer_user_id)).size],
    ["Всего людей с уровнем человечности ≥ 2", metrics.humanity_l2],
    ["Источники приглашений", countBy(referralsRows, (row) => row.source || "нет").slice(0, 5).map(([source, value]) => `${source} ${value}`).join(", ") || "—"]
  ]));

  // 9. Core and Wallet
  const coreDistribution = summarizeDistribution(participants.map((row) => row.coreBalance));
  const composition = growthComposition(participants.map((row) => row.coreGrowth));
  const equity = equityGuard(participants);
  const walletTotal = (t.wallet_accounts ?? []).reduce((sum, row) => sum + num(row.balance), 0);
  const ledger7 = (t.wallet_ledger ?? []).filter((row) => within(row.created_at, 7));
  metrics.core_total = Number(coreDistribution.total.toFixed(2));
  metrics.wallet_total = Number(walletTotal.toFixed(2));
  out.push("\n## 9. Core и Wallet");
  out.push(table(["Показатель", "Значение"], [
    ["Core всего / медиана / p90", `${money(coreDistribution.total)} / ${money(coreDistribution.median)} / ${money(coreDistribution.p90)}`],
    ["Джини по Core", coreDistribution.gini === null ? "—" : coreDistribution.gini.toFixed(2)],
    ["Новый Core: за результаты / пополнения / лидерский бонус", `${share(composition.earnedShare)} / ${share(composition.topUpShare)} / ${share(composition.leaderShare)}`],
    ["Справедливость роста", `${equity.verdict}${equity.reasons.length ? ` — ${equity.reasons.join("; ")}` : ""}`],
    ["Wallet всего", money(walletTotal)]
  ]));
  out.push("\nОперации Wallet за 7 дней:");
  const ledgerByType = new Map<string, { count: number; inflow: number; outflow: number }>();
  for (const row of ledger7) {
    const entry = ledgerByType.get(row.operation_type) ?? { count: 0, inflow: 0, outflow: 0 };
    entry.count += 1;
    if (row.direction === "credit") entry.inflow += num(row.amount);
    else entry.outflow += num(row.amount);
    ledgerByType.set(row.operation_type, entry);
  }
  out.push(table(["Операция", "Кол-во", "Приход", "Расход"], [...ledgerByType.entries()].sort((a, b) => b[1].count - a[1].count).map(([type, value]) => [type, value.count, money(value.inflow), money(value.outflow)])));

  // 10. Marketplace and spending
  const listings = t.marketplace_listings ?? [];
  const deals = t.marketplace_deals ?? [];
  metrics.listings_active = listings.filter((row) => row.status === "active").length;
  metrics.deals_completed_7d = deals.filter((row) => row.status === "completed" && within(row.completed_at, 7)).length;
  out.push("\n## 10. Маркетплейс и расходы");
  out.push(table(["Показатель", "Значение"], [
    ["Активных объявлений / новых за 7 дней", `${metrics.listings_active} / ${listings.filter((row) => within(row.created_at, 7)).length}`],
    ["На проверке перед показом гостям", listings.filter((row) => guestReview(row.metadata)?.status === "pending").length],
    ["Сделок за 7 дней по статусам", countBy(deals.filter((row) => within(row.created_at, 7)), (row) => row.status).map(([status, value]) => `${status} ${value}`).join(", ") || "нет"],
    ["Завершённых сделок за 7 дней", metrics.deals_completed_7d],
    ["Активных объявлений без продаж", listings.filter((row) => row.status === "active" && num(row.sales_count) === 0).length]
  ]));
  const spend = t.user_spend_intents ?? [];
  out.push(`\nХотят перенести расходы в OA: ${spend.filter((row) => (row.categories ?? []).length > 0).length} чел., из них согласны на предложения: ${spend.filter((row) => row.offers_consent).length}.`);
  out.push(table(["Категория расходов", "Людей"], groupPeople(spend.flatMap((row) => (row.categories ?? []).map((category: string) => [category, row.user_id] as [string, string])), minGroup)));
  details.listings = listings.map((row) => ({ id: row.id, seller: p(row.seller_user_id), title: clip(row.title, 120), status: row.status, price: `${row.price_amount} ${row.currency_code}`, sales: row.sales_count }));

  // 11. Voice of people
  const feedbackRows = t.user_feedback ?? [];
  const satisfaction = summarizeSatisfaction(participants);
  out.push("\n## 11. Голос людей");
  out.push(table(["Показатель", "Значение"], [
    ["Отзывов в приложении за 7 дней (по типам)", countBy(feedbackRows.filter((row) => within(row.created_at, 7)), (row) => row.category).map(([category, value]) => `${category} ${value}`).join(", ") || "нет"],
    ["Экраны с жалобами (problem/confusing, 30 дней)", countBy(feedbackRows.filter((row) => row.category === "problem" || row.category === "confusing"), (row) => row.screen || "?").slice(0, 5).map(([screen, value]) => `${screen} ${value}`).join(", ") || "нет"],
    ["«Помогло продвинуть желание»", `${satisfaction.wishOutcome.positive} из ${satisfaction.wishOutcome.answered}`],
    ["Полезный чек-ин", `${satisfaction.checkin.positive} из ${satisfaction.checkin.answered}`],
    ["Сообщений Нове за 7 дней / людей", `${(t.ai_usage_events ?? []).filter((row) => row.capability === "chat.general" && row.status === "accepted" && within(row.created_at, 7)).length} / ${new Set((t.ai_usage_events ?? []).filter((row) => within(row.created_at, 7)).map((row) => row.user_id)).size}`],
    ["Сбоев ИИ за 7 дней", (t.ai_usage_events ?? []).filter((row) => row.status === "failed" && within(row.created_at, 7)).length],
    ["Включённых push-подписок / привязанных Telegram", `${(t.push_subscriptions ?? []).filter((row) => row.enabled).length} / ${(t.telegram_accounts ?? []).length}`]
  ]));
  details.feedback_30d = feedbackRows.map((row) => ({ person: p(row.user_id), category: row.category, screen: row.screen, message: clip(row.message, 600), created_at: row.created_at }));

  // 12. Personal next steps
  const stalledUsers = new Set(stalled.map((row) => row.user_id));
  const steps = participants.map((participant) => ({
    person: p(participant.id),
    step: nextStepFor(participant, { lastActiveMs: lastActive.get(participant.id) ?? null, stalledChallenge: stalledUsers.has(participant.id) }, now)
  }));
  const stepCounts = countBy(steps, (row) => row.step);
  out.push("\n## 12. Персональные следующие шаги (сколько людей)");
  out.push(table(["Шаг", "Людей", "Смысл"], stepCounts.map(([step, value]) => [step, value, NEXT_STEP_LABELS[step as NextStep]])));
  details.personal_next_steps = steps;
  for (const [step, value] of stepCounts) metrics[`step_${step}`] = value;

  // 13. What to offer
  out.push("\n## 13. Что предлагать (сигналы → направление)");
  out.push(table(["Направление", "Сигнал", "Идея"], productSignals({ categories, unmetNeeds, spend, listings, metrics, stepCounts: new Map(stepCounts), feedbackRows, events, within })));

  // 14. Proposals for the approval queue
  const proposals = buildProposals(participants, dateKey, now);
  out.push("\n## 14. Предложения действий (только после подтверждения Evgen)");
  out.push(proposals.length
    ? table(["Тип", "Что", "Почему", "Людей"], proposals.map((proposal) => [proposal.kind, proposal.title, proposal.rationale, proposal.targetUserIds.length]))
    : "_правила сегодня ничего не предлагают_");
  details.proposals = proposals.map((proposal: Proposal) => ({
    kind: proposal.kind, title: proposal.title, rationale: proposal.rationale, expectedEffect: proposal.expectedEffect, risk: proposal.risk,
    people: proposal.targetUserIds.map((id) => p(id))
  }));
  const queue = t.coordinator_recommendations ?? [];
  if (queue.length) out.push(`\nОчередь рекомендаций за окно: ${countBy(queue, (row) => row.status).map(([status, value]) => `${status} ${value}`).join(", ")}.`);

  // 15. The growth path
  const path = buildPathReport(t, { now, minGroup, pseudonym: p });
  Object.assign(metrics, path.metrics);
  out.push("\n## 15. Путь квестов");
  out.push(path.steps.length
    ? table(["Шаг", "Квест", "Дошли", "Выполнили", "Пропустили", "Застряли 2+ дня", "Медиана дней"], path.steps.map((step) => [
      step.step, step.title, step.reached, `${step.completed} (${pct(step.completed, step.reached)})`, step.declined, step.stuck, step.medianDays ?? "—"
    ]))
    : "_путь не задан_");
  out.push(`\n«Первый шаг» в первые сутки: ${path.firstStepDay1.done} из ${path.firstStepDay1.eligible} (${pct(path.firstStepDay1.done, path.firstStepDay1.eligible)}, цель 70%). Ответили «зачем ты здесь»: ${metrics.path_motive_answered}.`);
  out.push("\nСообщения Новы и контрольная группа (старше 72 ч):");
  out.push(path.nudges.length
    ? table(["Группа", "Сообщение", "Людей", "Зашли за 24 ч", "Сдвинулись за 72 ч"], path.nudges.map((row) => [
      row.group === "sent" ? "получили" : "контроль", row.step === "all" ? "все" : row.step, row.people, pct(row.opened24h, row.people), pct(row.progressed72h, row.people)
    ]))
    : "_пока нет сообщений старше 72 ч_");
  if (path.motives.length) {
    out.push("\nЗачем пришли (группы от " + minGroup + " человек):");
    out.push(table(["Ответ", "Людей", "Медиана квестов"], path.motives.map((row) => [row.motive, row.people, row.medianQuests])));
  }
  out.push(`\nЛидеров недели (2+ квеста за 7 дней): ${path.leaders.length}${path.leaders.length ? `, у первого ${path.leaders[0].quests}` : ""}.`);
  out.push("\n### Предложения по улучшению (решение за Evgen)");
  out.push(path.proposals.length ? path.proposals.map((proposal, index) => `${index + 1}. **${proposal.title}.** ${proposal.why}`).join("\n") : "_сегодня правила ничего не предлагают_");
  const feedback = buildQuestFeedbackReport(t, { now });
  Object.assign(metrics, feedback.metrics);
  out.push("\n### Что говорят по ходу квестов (7 дней)");
  out.push(feedback.ratings.length
    ? table(["Квест", "Оценок", "Средняя", "3 и ниже", "Причины"], feedback.ratings.map((row) => [row.quest, row.ratings, row.average, row.low, row.reasons || "—"]))
    : "_оценок пока нет_");
  const line = (label: string, rows: Array<[string, number]>) => out.push(`${label}: ${rows.length ? rows.map(([key, count]) => `${key} ${count}`).join(", ") : "—"}.`);
  line("Причины «Пропустить»", feedback.skipReasons);
  line("«Как тебе сумма?» в «Сила Core»", feedback.corePowerReactions);
  line("Первое желание", feedback.firstWishes);
  line("Что нужно, чтобы продолжать", feedback.continueAnswers);
  if (feedback.proposals.length) out.push(feedback.proposals.map((proposal) => `- **${proposal.title}.** ${proposal.why}`).join("\n"));
  details.questFeedback = feedback;
  details.path = { steps: path.steps, firstStepDay1: path.firstStepDay1, nudges: path.nudges, motives: path.motives, leaders: path.leaders, proposals: path.proposals };

  // 16. Referral program
  const referral = buildReferralReport(t, { now });
  Object.assign(metrics, referral.metrics);
  out.push("\n## 16. Реферальная программа (7 дней)");
  out.push(table(["Этап", "Людей"], referral.funnel.map((row) => [row.stage, row.people])));
  out.push(`\nПриглашённых всего ${referral.invitations.total}, за 7 дней ${referral.invitations.window}; сделали задание ${referral.invitations.active}, прошли «Я не робот» ${referral.invitations.confirmed}.`);
  out.push(`Выплачено за 7 дней: ${money(referral.paid.core)} в Core, ${money(referral.paid.wallet)} в Wallet${referral.paid.byKind.length ? ` (${referral.paid.byKind.map((row) => `${row.kind} ×${row.count}`).join(", ")})` : ""}.`);
  if (referral.shares.length) out.push("Как делятся: " + referral.shares.map((row) => `${row.via} ${row.times} раз (${row.people} чел.)`).join(", ") + ".");
  out.push(referral.help.length ? "Что поможет приглашать: " + referral.help.map((row) => `${row.answer} ${row.people}`).join(", ") + "." : "Ответов «что поможет приглашать» пока нет.");
  out.push("\n### Предложения по рефералам (решение за Evgen)");
  out.push(referral.proposals.length ? referral.proposals.map((proposal, index) => `${index + 1}. **${proposal.title}.** ${proposal.why}`).join("\n") : "_сегодня правила ничего не предлагают_");
  details.referrals = { funnel: referral.funnel, shares: referral.shares, help: referral.help, paid: referral.paid, invitations: referral.invitations, proposals: referral.proposals };

  out.push("\n## Детали");
  out.push("Файлы рядом с этой сводкой (`details/*.json`): " + Object.keys(details).map((key) => `\`${key}\``).join(", ") + ".");

  return { summary: out.join("\n"), metrics, details };
}

type SignalInput = {
  categories: Array<[string, number]>;
  unmetNeeds: Array<[string, number]>;
  spend: Row[];
  listings: Row[];
  metrics: Record<string, number>;
  stepCounts: Map<string, number>;
  feedbackRows: Row[];
  events: Row[];
  within: (iso: unknown, days: number) => boolean;
};

/** Six directions from the brief. Each line names the signal it rests on so the decision can be checked. */
function productSignals(input: SignalInput): Array<[string, string, string]> {
  const rows: Array<[string, string, string]> = [];
  const topCategory = input.categories.find(([label]) => !label.startsWith("другое") && label !== "без категории");
  const spenders = input.spend.filter((row) => row.offers_consent).length;
  const idleListings = input.listings.filter((row) => row.status === "active" && num(row.sales_count) === 0).length;
  rows.push(["Доход", `${spenders} готовы получать предложения по расходам; ${idleListings} объявлений без продаж`,
    idleListings > 0 ? "челлендж «первая продажа»: разбор объявления с Новой + показ в витрине" : "продукт OA в самой частой категории расходов"]);
  rows.push(["Рост", `застряли в задании: ${input.stepCounts.get("smaller_step") ?? 0}; без задания: ${input.stepCounts.get("first_challenge") ?? 0}`,
    "дробить первый челлендж на шаг в 5 минут; цепочка из 3 шагов с наградой за каждый"]);
  rows.push(["Обучение", input.unmetNeeds.length ? `спрос без предложения: ${input.unmetNeeds.map(([tag]) => tag).join(", ")}` : "явных пробелов нет",
    input.unmetNeeds.length ? `мини-курс + челлендж по «${input.unmetNeeds[0][0]}», потом искать наставника` : "подтверждение навыков у тех, у кого уровень есть, а статуса нет"]);
  const combo = input.events.filter((event) => event.event_name === "daily_combo_completed" && input.within(event.occurred_at, 7)).length;
  rows.push(["Развлечения", `комбо дня за 7 дней: ${combo}`, combo > 0 ? "сюрприз в саду за серию комбо" : "проверить, видят ли комбо дня; добавить загадку от участников"]);
  rows.push(["Желания", topCategory ? `чаще всего: ${topCategory[0]} (${topCategory[1]} чел.)` : "категории ещё мелкие",
    topCategory ? `готовый путь к желанию «${topCategory[0]}»: шаги + продукт/услуга внутри OA` : "спросить 1 вопрос: какое желание ближе всего"]);
  const problems = input.feedbackRows.filter((row) => (row.category === "problem" || row.category === "confusing") && input.within(row.created_at, 7)).length;
  rows.push(["Решение проблем", `жалоб и непоняток за 7 дней: ${problems}`, problems > 0 ? "разобрать details/feedback_30d.json и починить топ-1 экран" : "спросить у застрявших, что мешает (1 вопрос)"]);
  return rows;
}

/** Day-over-day changes for the numbers that moved. */
export function renderDeltas(metrics: Record<string, number>, previous: Record<string, number> | null, previousDate: string | null): string {
  if (!previous) return "_Сравнение со вчера появится со второго запуска._";
  const moved = Object.entries(metrics)
    .filter(([key, value]) => typeof previous[key] === "number" && previous[key] !== value)
    .map(([key, value]) => [key, previous[key], value, `${value - previous[key] > 0 ? "+" : ""}${Number((value - previous[key]).toFixed(2))}`] as Array<string | number>);
  return `### Изменения с ${previousDate}\n` + (moved.length ? table(["Метрика", "Было", "Стало", "Δ"], moved) : "_без изменений_");
}
