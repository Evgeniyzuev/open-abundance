// The growth path (docs/QUEST_PATH_PLAN.md): one active quest, 3–5 available, a few "almost available", the rest
// waiting until progress opens them. Pure functions shared by the challenges API and the client, no server imports.

export const QUEST_MOTIVES = ["income", "wish", "change", "learn", "path", "own"] as const;
export type QuestMotive = (typeof QUEST_MOTIVES)[number];

// Same rate as lib/coreCalculator.ts; kept here so this file has no imports and runs in the node contract test.
const DAILY_CORE_RATE = 0.000633;

export const FIRST_STEP_LOGIC = "first_step_motive";
/** Path step 3: a push code that only the installed app asks for (the Telegram bot is step 4, "code_telegram"). */
export const APP_INSTALLED_LOGIC = "app_installed";
export const MOTIVE_NOTE_MAX = 200;
export const AVAILABLE_LIMIT = 4;
export const ALMOST_LIMIT = 3;

export function isQuestMotive(value: unknown): value is QuestMotive {
  return typeof value === "string" && (QUEST_MOTIVES as readonly string[]).includes(value);
}

/** Answers to "why are you here", several allowed: known values only, each once, in the order given. */
export function parseMotives(value: unknown): QuestMotive[] {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(list.filter(isQuestMotive))];
}

export type QuestRecord = {
  id: string;
  category?: string | null;
  verification_logic?: string | null;
  track_key?: string | null;
  sort_order: number;
  difficulty_level: number;
  path_order?: number | null;
  unlock_at_completed?: number | null;
  is_permanent?: boolean;
  can_accept?: boolean;
  /** Locked by level, a previous step or the humanity check, but one step away (lib/challengeEligibility.ts). */
  almost_eligible?: boolean;
  user_challenge_status?: string | null;
  user_challenge_active?: boolean;
};

export type QuestPlacement = "active" | "path_next" | "available" | "more" | "almost" | "hidden" | "accepted" | "completed" | "permanent";

export type QuestPathView = {
  activeId: string | null;
  /** Path quest the server should accept and make active because nothing is active yet. */
  autoActivateId: string | null;
  pathTotal: number;
  pathDone: number;
  /** 1-based position of the active quest on the path, null when the active quest is a side quest. */
  activePathStep: number | null;
  placements: Record<string, QuestPlacement>;
  /** Completed quests still needed to open a side quest; only for "almost" ones. */
  questsMissing: Record<string, number>;
};

// What each answer to "why are you here" brings forward among side quests.
const MOTIVE_CATEGORIES: Record<QuestMotive, string[]> = {
  income: ["marketplace", "finance", "growth"],
  wish: ["start_path", "growth", "finance"],
  change: ["self_discovery", "focus", "skills"],
  learn: ["core_education", "ai_assistant", "self_discovery"],
  path: ["focus", "start_path", "social"],
  own: []
};

const status = (quest: QuestRecord) => String(quest.user_challenge_status ?? "").trim().toLowerCase();
const isCompleted = (quest: QuestRecord) => status(quest) === "completed";
const isAccepted = (quest: QuestRecord) => status(quest) === "accepted" || status(quest) === "failed";
const isDeclined = (quest: QuestRecord) => status(quest) === "declined";

/** Quests that count as progress: every completed quest except the automatic onboarding ones. */
export function completedQuestCount(quests: QuestRecord[]): number {
  return quests.filter((quest) => isCompleted(quest) && String(quest.category ?? "") !== "onboarding").length;
}

export function questUnlocked(quest: Pick<QuestRecord, "unlock_at_completed">, completedCount: number): boolean {
  return completedCount >= Math.max(0, Number(quest.unlock_at_completed ?? 0));
}

export function sortPath(quests: QuestRecord[]): QuestRecord[] {
  return quests
    .filter((quest) => quest.path_order != null)
    .sort((left, right) => Number(left.path_order) - Number(right.path_order) || left.sort_order - right.sort_order);
}

/**
 * Places every quest. A skipped (declined) or unfinished path quest never blocks the rest: the next path quest is
 * open as soon as the one before it is completed, skipped or simply accepted, and side quests open by the number of
 * completed quests, whichever they were.
 */
export function buildQuestPath(quests: QuestRecord[], motive: QuestMotive | QuestMotive[] | null, options: { signedIn: boolean } = { signedIn: true }): QuestPathView {
  const completedCount = completedQuestCount(quests);
  const path = sortPath(quests);
  const placements: Record<string, QuestPlacement> = {};
  const questsMissing: Record<string, number> = {};

  // A path quest is open when every path quest before it was at least started (accepted, completed or skipped).
  const openPath = new Set<string>();
  for (const quest of path) {
    openPath.add(quest.id);
    if (!status(quest)) break;
  }

  const explicitActive = quests.find((quest) => quest.user_challenge_active && isAccepted(quest)) ?? null;
  const currentIndex = path.findIndex((quest) => !isCompleted(quest) && !isDeclined(quest) && openPath.has(quest.id));
  const currentPath = currentIndex >= 0 ? path[currentIndex] : null;
  const defaultActive = currentPath && (isAccepted(currentPath) || currentPath.can_accept !== false)
    ? currentPath
    : quests.find((quest) => isAccepted(quest) && !quest.is_permanent) ?? null;
  const autoActivateId = options.signedIn && !explicitActive && defaultActive ? defaultActive.id : null;
  const activeId = explicitActive?.id ?? defaultActive?.id ?? null;

  const pathIndex = activeId ? path.findIndex((quest) => quest.id === activeId) : -1;
  // The next path quest after the current one, so a person can move on without finishing it.
  const nextPath = path.find((quest, index) => index > currentIndex && openPath.has(quest.id) && !status(quest) && quest.can_accept !== false) ?? null;

  const motives = parseMotives(motive);
  // A side quest that fits more of the person's answers comes first.
  const scoreFor = (quest: QuestRecord) => motives.filter((item) => MOTIVE_CATEGORIES[item].includes(String(quest.category ?? ""))).length;
  const sideCandidates: QuestRecord[] = [];

  for (const quest of quests) {
    if (quest.id === activeId) {
      placements[quest.id] = "active";
      continue;
    }
    if (quest.is_permanent && (isAccepted(quest) || isCompleted(quest))) {
      placements[quest.id] = "permanent";
      continue;
    }
    if (isCompleted(quest)) {
      placements[quest.id] = "completed";
      continue;
    }
    if (isAccepted(quest)) {
      placements[quest.id] = "accepted";
      continue;
    }
    if (quest.path_order != null) {
      if (nextPath?.id === quest.id) placements[quest.id] = "path_next";
      else if (openPath.has(quest.id) && (isDeclined(quest) || quest.can_accept !== false)) placements[quest.id] = "more";
      else placements[quest.id] = "hidden";
      continue;
    }
    if (!questUnlocked(quest, completedCount)) {
      const missing = Math.max(0, Number(quest.unlock_at_completed ?? 0)) - completedCount;
      if (missing <= 2) {
        placements[quest.id] = "almost";
        questsMissing[quest.id] = missing;
      } else {
        placements[quest.id] = "hidden";
      }
      continue;
    }
    if (quest.can_accept === false) {
      placements[quest.id] = quest.almost_eligible ? "almost" : "hidden";
      continue;
    }
    if (isDeclined(quest)) {
      placements[quest.id] = "more";
      continue;
    }
    sideCandidates.push(quest);
  }

  const pathNextShown = Boolean(nextPath);
  const ranked = [...sideCandidates].sort((left, right) => scoreFor(right) - scoreFor(left) || left.sort_order - right.sort_order || left.difficulty_level - right.difficulty_level);
  const availableLimit = pathNextShown ? AVAILABLE_LIMIT : AVAILABLE_LIMIT + 1;
  ranked.forEach((quest, index) => {
    placements[quest.id] = index < availableLimit ? "available" : "more";
  });

  // Keep the "almost" list short: the closest ones first.
  const almost = quests
    .filter((quest) => placements[quest.id] === "almost")
    .sort((left, right) => (questsMissing[left.id] ?? 0) - (questsMissing[right.id] ?? 0) || left.sort_order - right.sort_order);
  almost.slice(ALMOST_LIMIT).forEach((quest) => {
    placements[quest.id] = "hidden";
    delete questsMissing[quest.id];
  });

  return {
    activeId,
    autoActivateId,
    pathTotal: path.length,
    pathDone: path.filter(isCompleted).length,
    activePathStep: pathIndex >= 0 ? pathIndex + 1 : null,
    placements,
    questsMissing
  };
}

/** Daily addition that brings Core from start to target in the given days with all income reinvested. */
export function requiredDailyAddition(startCore: number, targetCore: number, days: number): number {
  if (days <= 0) return 0;
  const multiplier = Math.pow(1 + DAILY_CORE_RATE, days);
  const needed = (targetCore - startCore * multiplier) * DAILY_CORE_RATE / (multiplier - 1);
  return needed > 0 ? Math.ceil(needed * 100) / 100 : 0;
}
