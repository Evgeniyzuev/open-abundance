// The bridge from the feed to quests: a story ends with "Your similar first step" (the quest closest to it), and the
// "All" feed opens with the quest of the day. No project imports, so node tests it directly.

/** The part of a quest row from GET /api/challenges that the feed needs. */
export type FeedQuest = {
  id: string;
  title: Record<string, string> | null;
  core_reward_amount: number;
  difficulty_level: number;
  verification_logic: string | null;
  can_accept?: boolean;
  prerequisite_completed?: boolean;
  prerequisite_challenge_id?: string | null;
  is_permanent?: boolean;
  user_challenge_status?: string | null;
  path_order?: number | null;
  /** Where the Quests tab shows it (lib/questPath.ts); a hidden quest cannot be opened there yet. */
  quest_placement?: string;
};

export type FeedQuestData = {
  challenges: FeedQuest[];
  viewerLevel: number;
  activeId: string | null;
};

type StoryPost = {
  source_key: string | null;
  post_type: string;
  verifiedChallenge?: { challenge_id: string } | null;
};

/**
 * Editorial and system stories by their source key → the quest whose first step is closest to the story's pain.
 * A story that is not here (or whose quest is done or out of reach) offers the person's next path step instead.
 */
const STORY_QUESTS: Record<string, string> = {
  "editorial_story:front-row": "attention_value_audit",
  "editorial_story:first-order": "first_marketplace_listing",
  "editorial_story:sea-for-mom": "has_wish",
  "editorial_story:our-own-key": "calculate_time_to_goal",
  "editorial_story:drawing-again": "niche_task_chosen",
  "editorial_story:what-is-easy": "values_goals_defined",
  "editorial_story:first-listing": "first_marketplace_listing",
  "editorial_story:one-dollar-a-day": "today_core_target_reached",
  "editorial_story:three-steps-to-move": "has_wish",
  "editorial_story:route-by-steps": "has_wish",
  "editorial_story:first-thousand-lesson": "calculate_time_to_goal",
  "editorial_story:coming-back": "three_day_focus",
  "editorial_story:neighbour-and-phone": "trust_event_confirmed:help_given",
  "editorial_story:ai-future-choice": "ai_essay_review",
  "system_story:01-housing-and-productivity": "calculate_time_to_goal",
  "system_story:02-access-scarcity": "attention_value_audit",
  "system_story:03-money-flows": "calculate_time_to_goal",
  "system_story:04-ai-and-work": "niche_task_chosen",
  "system_story:05-power-and-appeal": "values_goals_defined",
  "system_story:06-coordination-gap": "ai_message_sent",
  "system_story:07-connected-path": "has_wish",
  "system_story:08-portable-contribution": "skill_profile_completed",
  "system_story:09-transparent-algorithms": "attention_value_audit",
  "system_story:10-first-personal-step": "has_wish",
  "system_story:11-positive-sum": "trust_event_confirmed:help_given",
  "system_story:12-test-before-belief": "three_day_focus"
};

/** Not shown in the Quests tab yet (or done there), so a feed button could not open them. */
const CLOSED_PLACEMENTS = new Set(["hidden", "almost", "completed"]);

/** Quests that make no sense to offer from the feed (they finish by themselves or need another day). */
const NOT_FROM_FEED = new Set(["day_2_return", "has_referral", "referral_program"]);

/** The person can start (or continue) this quest now. */
export function isOpenQuest(quest: FeedQuest, viewerLevel: number): boolean {
  if (quest.user_challenge_status === "completed") return false;
  if (quest.quest_placement && CLOSED_PLACEMENTS.has(quest.quest_placement)) return false;
  if (quest.can_accept === false) return false;
  if (quest.difficulty_level > viewerLevel) return false;
  if (quest.prerequisite_challenge_id && quest.prerequisite_completed === false) return false;
  return !NOT_FROM_FEED.has(quest.verification_logic ?? "");
}

/** The quest a story leads to: its own (a verified quest post) or its mapped one, else the active path step. */
export function similarQuestForPost(post: StoryPost, data: FeedQuestData): { quest: FeedQuest; similar: boolean } | null {
  const open = (quest: FeedQuest | undefined) => (quest && isOpenQuest(quest, data.viewerLevel) ? quest : undefined);
  const ownId = post.verifiedChallenge?.challenge_id;
  const logic = post.source_key ? STORY_QUESTS[post.source_key.trim().toLowerCase()] : undefined;
  const similar = open(ownId ? data.challenges.find((quest) => quest.id === ownId) : undefined)
    ?? open(logic ? data.challenges.find((quest) => quest.verification_logic === logic) : undefined);
  if (similar) return { quest: similar, similar: true };
  const next = nextQuest(data);
  return next ? { quest: next, similar: false } : null;
}

/** The active path step, else the open path step with the lowest order, else the first open quest by level. */
export function nextQuest(data: FeedQuestData): FeedQuest | null {
  const open = openQuests(data);
  return pathStep(open, data.activeId) ?? [...open].sort((a, b) => a.difficulty_level - b.difficulty_level)[0] ?? null;
}

/**
 * The quest of the day for the "All" feed: the active path step while the path lasts; after it, one open quest
 * chosen by the UTC day, the same for the whole day.
 */
export function questOfDay(data: FeedQuestData, day: string): FeedQuest | null {
  const open = openQuests(data);
  const step = pathStep(open, data.activeId);
  if (step || !open.length) return step;
  const sorted = [...open].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[hashDay(day) % sorted.length];
}

function openQuests(data: FeedQuestData): FeedQuest[] {
  return data.challenges.filter((quest) => isOpenQuest(quest, data.viewerLevel) && !quest.is_permanent);
}

function pathStep(open: FeedQuest[], activeId: string | null): FeedQuest | null {
  const active = open.find((quest) => quest.id === activeId);
  if (active) return active;
  return open.filter((quest) => quest.path_order != null).sort((a, b) => (a.path_order ?? 0) - (b.path_order ?? 0))[0] ?? null;
}

function hashDay(day: string): number {
  let hash = 0;
  for (const char of day) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function questTitle(quest: FeedQuest, locale: string): string {
  return quest.title?.[locale] ?? quest.title?.en ?? quest.title?.ru ?? "";
}
