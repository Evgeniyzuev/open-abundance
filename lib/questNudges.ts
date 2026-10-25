// Nova's personal message about the growth path (docs/QUEST_PATH_PLAN.md, section 8.2). Pure: the coordinator job
// (lib/coordinatorNudges.ts) loads the data, `chooseNudge` in lib/coordinatorNextStep.ts calls `chooseQuestNudge`
// unless QUEST_NUDGES_ENABLED=0, and the daily analytics compare the outcome with the control group.
//
// Rules, first match wins: the first step is not done; the person is among the leaders of the week (praise); they have
// not opened the app for 7+ days; a side quest has just opened; the active quest has not moved for 2+ days. When
// everything goes well Nova does not write. Limits on top of the coordinator's own (one a day, quiet after three
// unanswered): three a week. Copy says only what the person sees about themselves in the app.

import type { Localized } from "./locales.ts";

const DAY_MS = 86_400_000;

export const QUEST_NUDGE_KEYS = ["quest_first_step", "quest_leader", "quest_comeback", "quest_unlocked", "quest_stalled"] as const;
export type QuestNudgeKey = (typeof QUEST_NUDGE_KEYS)[number];

export const QUEST_NUDGE_WEEK_LIMIT = 3;
export const QUEST_STALLED_AFTER_MS = 2 * DAY_MS;
export const QUEST_COMEBACK_AFTER_MS = 7 * DAY_MS;
/** A quest that opened within this time is still news. */
export const QUEST_UNLOCK_NEWS_MS = 3 * DAY_MS;
/** Leaders of the week who get Nova's praise (once a week). */
export const QUEST_LEADER_PRAISE_TOP = 3;
/** Every tenth person gets no messages at all, so the analytics can see whether the messages help. */
export const HOLDOUT_SHARE = 10;
export const HOLDOUT_EVENT = "quest_nudge_holdout";

export type QuestCopy = { title: string; body: string; button: string };

export type QuestCatalogItem = {
  id: string;
  title: Localized<string>;
  pathOrder: number | null;
  unlockAtCompleted: number;
  category: string | null;
  sortOrder: number;
};

export type QuestUserRow = { challengeId: string; status: string; isActive: boolean; updatedAt: number };

export type QuestNudgeInput = {
  catalog: QuestCatalogItem[];
  rows: QuestUserRow[];
  /** Place among the leaders of the week, 1-based, or null. */
  leaderRank: number | null;
  /** Quests done in the last 7 days (for the praise text). */
  weekQuests: number;
};

export type QuestSend = { step: string; at: number };

export type QuestNudge = { key: QuestNudgeKey; deepLink: string; copy: Localized<QuestCopy> };

const COPY: Record<QuestNudgeKey, Localized<QuestCopy>> = {
  quest_first_step: {
    ru: { title: "{name}, первая звезда ждёт тебя", body: "Одна минута: зачем ты здесь? По ответу я подберу квесты. Нова", button: "Ответить" },
    en: { title: "{name}, your first star is waiting", body: "One minute: why are you here? I'll pick quests from your answer. Nova", button: "Answer" }
  },
  quest_leader: {
    ru: { title: "{name}, ты в тройке недели!", body: "Квестов за 7 дней: {count}. Твой темп видят все в «Лидерах недели». Так держать! Нова", button: "Открыть квесты" },
    en: { title: "{name}, you are in this week's top three!", body: "Quests in 7 days: {count}. Everyone sees your pace in Leaders of the week. Keep going! Nova", button: "Open quests" }
  },
  quest_comeback: {
    ru: { title: "{name}, я сохранила твой путь", body: "Он остановился на квесте «{quest}». Шаг займёт пару минут, возвращайся, когда будет время. Нова", button: "Продолжить" },
    en: { title: "{name}, I kept your path", body: "It stopped at the quest \"{quest}\". The step takes a couple of minutes, come back when you have time. Nova", button: "Continue" }
  },
  quest_unlocked: {
    ru: { title: "{name}, открылся новый квест", body: "«{quest}» уже доступен: это награда за пройденные шаги. Нова", button: "Посмотреть" },
    en: { title: "{name}, a new quest has opened", body: "\"{quest}\" is open now: a reward for the steps you have done. Nova", button: "Take a look" }
  },
  quest_stalled: {
    ru: { title: "{name}, квест «{quest}» ждёт", body: "Сделай сегодня один маленький шаг. Если что-то не получается, спроси меня, разберём вместе. Нова", button: "Открыть квест" },
    en: { title: "{name}, the quest \"{quest}\" is waiting", body: "Take one small step today. If something doesn't work, ask me and we'll sort it out together. Nova", button: "Open the quest" }
  }
};

const DEEP_LINK = "/?view=challenges";

/** Stable 1-in-10 control group by user id (FNV-1a), the same on every run. */
export function isHoldout(userId: string): boolean {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % HOLDOUT_SHARE === 0;
}

export function isQuestNudgeKey(value: string): value is QuestNudgeKey {
  return (QUEST_NUDGE_KEYS as readonly string[]).includes(value);
}

/** Messages of any kind in the last 7 days; quest mode allows QUEST_NUDGE_WEEK_LIMIT of them. */
export function weekSends(sends: QuestSend[], now: number): number {
  return sends.filter((send) => now - send.at < 7 * DAY_MS).length;
}

function fill(copy: Localized<QuestCopy>, values: { quest: Localized<string> | null; count: number }): Localized<QuestCopy> {
  const result: Record<string, QuestCopy> = {};
  for (const [locale, text] of Object.entries(copy) as Array<[string, QuestCopy]>) {
    const quest = values.quest ? ((values.quest as Record<string, string | undefined>)[locale] ?? values.quest.en) : "";
    const put = (template: string) => template.replace(/\{quest\}/g, quest).replace(/\{count\}/g, String(values.count));
    result[locale] = { title: put(text.title), body: put(text.body), button: text.button };
  }
  return result as Localized<QuestCopy>;
}

function nudge(key: QuestNudgeKey, quest: QuestCatalogItem | null, count = 0): QuestNudge {
  return { key, deepLink: DEEP_LINK, copy: fill(COPY[key], { quest: quest?.title ?? null, count }) };
}

/** Path quests the person has started; the first open one decides "first step done". */
function statusOf(rows: QuestUserRow[]): Map<string, QuestUserRow> {
  return new Map(rows.map((row) => [row.challengeId, row]));
}

/**
 * Nova's message about the path for one person, or null. Limits shared with other coordinator messages (one a day,
 * quiet after three unanswered, the first day after sign-up) are checked by the caller; this applies the week limit
 * and the rules above.
 */
export function chooseQuestNudge(input: QuestNudgeInput, sends: QuestSend[], lastActiveAt: number | null, now: number): QuestNudge | null {
  if (weekSends(sends, now) >= QUEST_NUDGE_WEEK_LIMIT) return null;
  const rows = statusOf(input.rows);
  const path = input.catalog.filter((quest) => quest.pathOrder != null).sort((left, right) => Number(left.pathOrder) - Number(right.pathOrder));
  const status = (id: string) => String(rows.get(id)?.status ?? "").toLowerCase();
  const sentSince = (step: QuestNudgeKey, since: number) => sends.some((send) => send.step === step && send.at > since);

  // 1. The first step. Twice at most, three days apart.
  const first = path[0];
  if (first && status(first.id) !== "completed") {
    const asked = sends.filter((send) => send.step === "quest_first_step");
    if (asked.length < 2 && asked.every((send) => now - send.at >= 3 * DAY_MS)) return nudge("quest_first_step", first);
  }

  // 2. Praise for the leaders of the week, once a week.
  if (input.leaderRank !== null && input.leaderRank <= QUEST_LEADER_PRAISE_TOP && !sentSince("quest_leader", now - 7 * DAY_MS)) {
    return nudge("quest_leader", null, input.weekQuests);
  }

  const active = input.rows.find((row) => row.isActive && (row.status === "accepted" || row.status === "failed")) ?? null;
  const activeQuest = active ? input.catalog.find((quest) => quest.id === active.challengeId) ?? null : null;

  // 3. Away for a week: one warm message per absence.
  if (lastActiveAt !== null && now - lastActiveAt >= QUEST_COMEBACK_AFTER_MS && !sentSince("quest_comeback", lastActiveAt)) {
    const nextOnPath = activeQuest ?? path.find((quest) => !["completed", "declined"].includes(status(quest.id))) ?? null;
    if (nextOnPath) return nudge("quest_comeback", nextOnPath);
  }

  // 4. A side quest opened by the last completed quest, not taken yet and not announced yet.
  const completed = input.rows.filter((row) => row.status === "completed");
  const completedCount = completed.filter((row) => input.catalog.find((quest) => quest.id === row.challengeId)?.category !== "onboarding").length;
  const lastCompletionAt = completed.reduce((latest, row) => Math.max(latest, row.updatedAt), 0);
  if (completedCount > 0 && now - lastCompletionAt <= QUEST_UNLOCK_NEWS_MS && !sentSince("quest_unlocked", lastCompletionAt)) {
    const opened = input.catalog
      .filter((quest) => quest.pathOrder == null && quest.unlockAtCompleted === completedCount && !rows.has(quest.id))
      .sort((left, right) => left.sortOrder - right.sortOrder)[0];
    if (opened) return nudge("quest_unlocked", opened);
  }

  // 5. The active quest has not moved for two days. Once per quiet spell, no more often than every three days.
  if (active && activeQuest && now - active.updatedAt >= QUEST_STALLED_AFTER_MS && now - lastCompletionAt >= QUEST_STALLED_AFTER_MS) {
    const lastAsk = sends.filter((send) => send.step === "quest_stalled").reduce((latest, send) => Math.max(latest, send.at), 0);
    if (lastAsk < active.updatedAt || now - lastAsk >= 3 * DAY_MS) return nudge("quest_stalled", activeQuest);
  }
  return null;
}
