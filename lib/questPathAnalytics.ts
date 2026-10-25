// The "Path" section of the daily analytics (docs/QUEST_PATH_PLAN.md, 8.3): how far people get on the growth path,
// where they get stuck, whether Nova's messages help compared with the control group, the leaders of the week, and
// improvement proposals for the founder. Pure and relative-import only, like lib/dailyAnalytics.ts.
import { HOLDOUT_EVENT, isQuestNudgeKey } from "./questNudges.ts";
import { weeklyLeaders } from "./questLeaders.ts";

type Row = Record<string, any>;
const DAY_MS = 86_400_000;

export type PathStepStats = {
  step: number;
  id: string;
  title: string;
  reached: number;
  completed: number;
  declined: number;
  /** Accepted, no change for 2+ days. */
  stuck: number;
  /** Median days from taking the quest to finishing it, null when nobody finished. */
  medianDays: number | null;
};

export type NudgeGroupStats = { group: "sent" | "holdout"; step: string; people: number; opened24h: number; progressed72h: number };

export type PathProposal = { title: string; why: string };

export type PathReport = {
  steps: PathStepStats[];
  firstStepDay1: { eligible: number; done: number };
  nudges: NudgeGroupStats[];
  motives: Array<{ motive: string; people: number; medianQuests: number }>;
  leaders: Array<{ person: string; quests: number }>;
  proposals: PathProposal[];
  metrics: Record<string, number>;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const titleOf = (value: unknown) => {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.ru ?? record.en ?? "");
  }
  return String(value ?? "");
};

/** Reads a coordinator message key: coach-next-step:<step>:<user id>[:<day>]. */
function parseKey(key: unknown): { step: string; userId: string } | null {
  const match = /^coach-next-step:([a-z_]+):([0-9a-f-]{36})/.exec(String(key ?? ""));
  return match ? { step: match[1], userId: match[2] } : null;
}

export function buildPathReport(
  tables: Record<string, Row[]>,
  options: { now: number; minGroup: number; pseudonym: (userId: string) => string }
): PathReport {
  const { now, minGroup } = options;
  const challenges = tables.challenges ?? [];
  const userChallenges = tables.user_challenges ?? [];
  const profiles = (tables.user_profiles ?? []).filter((row) => !row.deleted_at);
  const events = tables.product_events ?? [];
  const metrics: Record<string, number> = {};

  const path = challenges.filter((row) => row.path_order != null && row.is_active !== false).sort((a, b) => a.path_order - b.path_order);
  const rowsByChallenge = new Map<string, Row[]>();
  for (const row of userChallenges) {
    const list = rowsByChallenge.get(row.challenge_id) ?? [];
    list.push(row);
    rowsByChallenge.set(row.challenge_id, list);
  }

  const steps: PathStepStats[] = path.map((quest, index) => {
    const rows = rowsByChallenge.get(quest.id) ?? [];
    const done = rows.filter((row) => row.status === "completed");
    return {
      step: index + 1,
      id: quest.id,
      title: titleOf(quest.title).slice(0, 50),
      reached: rows.length,
      completed: done.length,
      declined: rows.filter((row) => row.status === "declined").length,
      stuck: rows.filter((row) => row.status === "accepted" && now - Date.parse(row.updated_at) >= 2 * DAY_MS).length,
      medianDays: (() => {
        const days = done.map((row) => (Date.parse(row.updated_at) - Date.parse(row.created_at)) / DAY_MS).filter((value) => Number.isFinite(value) && value >= 0);
        const value = median(days);
        return value === null ? null : Math.round(value * 10) / 10;
      })()
    };
  });
  steps.forEach((step) => {
    metrics[`path_step${step.step}_reached`] = step.reached;
    metrics[`path_step${step.step}_completed`] = step.completed;
  });

  // First step finished within a day of sign-up, for people who signed up at least a day ago.
  const firstId = path[0]?.id;
  const firstDone = new Map((rowsByChallenge.get(firstId) ?? []).filter((row) => row.status === "completed").map((row) => [row.user_id, Date.parse(row.updated_at)]));
  const firstFeatureAt = Math.min(...(rowsByChallenge.get(firstId) ?? []).map((row) => Date.parse(row.created_at)).filter(Number.isFinite), now);
  const eligible = profiles.filter((row) => Date.parse(row.created_at) >= firstFeatureAt && now - Date.parse(row.created_at) >= DAY_MS);
  const firstStepDay1 = {
    eligible: eligible.length,
    done: eligible.filter((row) => (firstDone.get(row.user_id) ?? Infinity) - Date.parse(row.created_at) <= DAY_MS).length
  };
  metrics.path_first_step_day1_eligible = firstStepDay1.eligible;
  metrics.path_first_step_day1_done = firstStepDay1.done;

  // Nova's messages against the control group: opened the app within 24 h, finished any quest within 72 h.
  const activity = new Map<string, number[]>();
  for (const event of events) {
    if (!event.user_id || event.event_name === HOLDOUT_EVENT) continue;
    const list = activity.get(event.user_id) ?? [];
    list.push(Date.parse(event.occurred_at));
    activity.set(event.user_id, list);
  }
  const completions = new Map<string, number[]>();
  for (const row of userChallenges) {
    if (row.status !== "completed") continue;
    const list = completions.get(row.user_id) ?? [];
    list.push(Date.parse(row.updated_at));
    completions.set(row.user_id, list);
  }
  const sends: Array<{ group: "sent" | "holdout"; step: string; userId: string; at: number }> = [];
  for (const row of tables.notification_events ?? []) {
    const parsed = parseKey(row.idempotency_key);
    if (parsed && isQuestNudgeKey(parsed.step)) sends.push({ group: "sent", step: parsed.step, userId: parsed.userId, at: Date.parse(row.created_at) });
  }
  for (const event of events) {
    if (event.event_name === HOLDOUT_EVENT && event.user_id) sends.push({ group: "holdout", step: String(event.properties?.step ?? "?"), userId: event.user_id, at: Date.parse(event.occurred_at) });
  }
  const nudgeMap = new Map<string, NudgeGroupStats>();
  for (const send of sends) {
    if (now - send.at < 72 * 3_600_000) continue; // too fresh to judge
    for (const step of [send.step, "all"]) {
      const key = `${send.group}:${step}`;
      const entry = nudgeMap.get(key) ?? { group: send.group, step, people: 0, opened24h: 0, progressed72h: 0 };
      entry.people += 1;
      if ((activity.get(send.userId) ?? []).some((at) => at > send.at && at - send.at <= DAY_MS)) entry.opened24h += 1;
      if ((completions.get(send.userId) ?? []).some((at) => at > send.at && at - send.at <= 3 * DAY_MS)) entry.progressed72h += 1;
      nudgeMap.set(key, entry);
    }
  }
  const nudges = [...nudgeMap.values()].sort((a, b) => (a.step === "all" ? -1 : 0) - (b.step === "all" ? -1 : 0) || a.step.localeCompare(b.step) || a.group.localeCompare(b.group));
  for (const entry of nudges.filter((item) => item.step === "all")) {
    metrics[`path_nudge_${entry.group}`] = entry.people;
    metrics[`path_nudge_${entry.group}_progressed`] = entry.progressed72h;
  }

  // Answers to "why are you here": groups of at least minGroup people only.
  const onboarding = new Set(challenges.filter((row) => row.category === "onboarding").map((row) => row.id));
  const questsByUser = new Map<string, number>();
  for (const row of userChallenges) {
    if (row.status === "completed" && !onboarding.has(row.challenge_id)) questsByUser.set(row.user_id, (questsByUser.get(row.user_id) ?? 0) + 1);
  }
  const byMotive = new Map<string, number[]>();
  for (const profile of profiles) {
    const motives: string[] = Array.isArray(profile.quest_motives) && profile.quest_motives.length ? profile.quest_motives : profile.quest_motive ? [profile.quest_motive] : [];
    for (const motive of motives) {
      const list = byMotive.get(motive) ?? [];
      list.push(questsByUser.get(profile.user_id) ?? 0);
      byMotive.set(motive, list);
    }
  }
  const motives = [...byMotive.entries()]
    .filter(([, list]) => list.length >= minGroup)
    .map(([motive, list]) => ({ motive, people: list.length, medianQuests: median(list) ?? 0 }))
    .sort((a, b) => b.people - a.people);
  metrics.path_motive_answered = profiles.filter((row) => (row.quest_motives?.length ?? 0) > 0 || row.quest_motive).length;

  const leaders = weeklyLeaders(userChallenges as any[], onboarding, now).map((leader) => ({ person: options.pseudonym(leader.userId), quests: leader.quests }));
  metrics.path_leaders = leaders.length;

  return { steps, firstStepDay1, nudges, motives, leaders, proposals: pathProposals(steps, firstStepDay1, nudges, leaders), metrics };
}

/**
 * Improvement proposals from today's numbers. They go to the founder in the summary; nothing changes without his yes.
 */
export function pathProposals(
  steps: PathStepStats[],
  firstStepDay1: { eligible: number; done: number },
  nudges: NudgeGroupStats[],
  leaders: Array<{ quests: number }>
): PathProposal[] {
  const proposals: PathProposal[] = [];
  const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

  // The step that loses the most people among those who reached it.
  const worst = steps
    .filter((step) => step.reached >= 5)
    .map((step) => ({ step, rate: step.completed / step.reached }))
    .sort((a, b) => a.rate - b.rate)[0];
  if (worst && worst.rate < 0.5) {
    proposals.push({
      title: `Упростить шаг ${worst.step.step} «${worst.step.title}»`,
      why: `Выполнили ${share(worst.step.completed, worst.step.reached)}% из ${worst.step.reached} дошедших, застряли ${worst.step.stuck}. Разбить на два коротких шага или дать готовый пример.`
    });
  }
  const stuckMost = [...steps].sort((a, b) => b.stuck - a.stuck)[0];
  if (stuckMost && stuckMost.stuck >= 5 && stuckMost !== worst?.step) {
    proposals.push({ title: `Помочь застрявшим на шаге ${stuckMost.step}`, why: `${stuckMost.stuck} человек держат «${stuckMost.title}» 2+ дня. Нова может предложить шаг поменьше.` });
  }
  if (firstStepDay1.eligible >= 5 && firstStepDay1.done / firstStepDay1.eligible < 0.7) {
    proposals.push({
      title: "Поднять «Первый шаг» в первый день",
      why: `Прошли в первые сутки ${share(firstStepDay1.done, firstStepDay1.eligible)}% (цель 70%). Показывать квест сразу после входа, а не только во вкладке «Квесты».`
    });
  }
  const sent = nudges.find((entry) => entry.step === "all" && entry.group === "sent");
  const holdout = nudges.find((entry) => entry.step === "all" && entry.group === "holdout");
  if (sent && holdout && sent.people >= 10 && holdout.people >= 5) {
    const lift = share(sent.progressed72h, sent.people) - share(holdout.progressed72h, holdout.people);
    proposals.push(lift <= 0
      ? { title: "Сменить текст или время сообщений Новы", why: `После сообщения сдвинулись ${share(sent.progressed72h, sent.people)}%, в контрольной группе ${share(holdout.progressed72h, holdout.people)}%: сообщения пока не помогают.` }
      : { title: "Сообщения Новы работают, оставить правила", why: `Сдвинулись ${share(sent.progressed72h, sent.people)}% против ${share(holdout.progressed72h, holdout.people)}% в контрольной группе (+${lift} п.п.).` });
  }
  if (leaders.length >= 3) {
    proposals.push({ title: "Наградить лидеров недели", why: `${leaders.length} человек прошли 2+ квеста за неделю. Предложение: значок «Лидер недели» в профиле; денежный бонус только после вашего «да».` });
  }
  return proposals;
}
