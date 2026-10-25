/**
 * What the person told the AI through ratings, kept only on the device. A 1–5 smiley plus a few tags per answer;
 * the last ratings turn into a few short instructions, without any AI, that go with every next note review and
 * every Nova chat message. The pure part (no imports) is tested directly by node.
 */

export const AI_FEEDBACK_TAGS = ["on_topic", "off_topic", "good_option", "generic", "my_tone", "not_my_tone", "shorter", "more_detail"] as const;
export type AiFeedbackTag = (typeof AI_FEEDBACK_TAGS)[number];
/** Tags come in pairs by aspect: topic, use, tone, length. Picking one of a pair clears the other. */
export const AI_FEEDBACK_PAIRS: Array<[AiFeedbackTag, AiFeedbackTag]> = [
  ["on_topic", "off_topic"],
  ["good_option", "generic"],
  ["my_tone", "not_my_tone"],
  ["shorter", "more_detail"]
];

export type AiFeedbackEntry = {
  at: string;
  rating: 1 | 2 | 3 | 4 | 5;
  tags: AiFeedbackTag[];
  source: "note" | "chat";
  /** Id of the rated answer: a later rating of the same answer replaces the earlier one. */
  ref: string;
};

export const AI_PREFERENCE_KEYS = ["brief", "detailed", "concrete", "stay_on_topic", "keep_tone", "change_tone", "new_approach"] as const;
export type AiPreferenceKey = (typeof AI_PREFERENCE_KEYS)[number];

/** Instructions for the model; the server maps keys to this text itself, so nothing else reaches the prompt. */
export const AI_PREFERENCE_PROMPTS: Record<AiPreferenceKey, string> = {
  brief: "Answer briefly: a few short sentences.",
  detailed: "Answer in more detail: explain the reasoning and the steps.",
  concrete: "Give concrete, specific options and steps for this person, not general advice.",
  stay_on_topic: "Stay strictly on what the person wrote; do not drift to related topics.",
  keep_tone: "Keep the tone of earlier answers: the person liked it.",
  change_tone: "Change the tone of earlier answers: the person did not feel it fit. Be plain, warm and respectful.",
  new_approach: "Earlier answers were rated low: try a different approach than usual."
};

const WINDOW = 20;
const MAX_ENTRIES = 40;

export function isPreferenceKey(value: unknown): value is AiPreferenceKey {
  return AI_PREFERENCE_KEYS.includes(value as AiPreferenceKey);
}

/** Adds or replaces the rating of one answer, newest last. */
export function addFeedbackEntry(entries: AiFeedbackEntry[], entry: AiFeedbackEntry): AiFeedbackEntry[] {
  return [...entries.filter((item) => item.ref !== entry.ref), entry].slice(-MAX_ENTRIES);
}

/**
 * Turns the last ratings into instructions. A wish counts when it was chosen at least twice and more often than
 * its opposite; three low ratings in a row ask for a new approach.
 */
export function buildPreferenceKeys(entries: AiFeedbackEntry[]): AiPreferenceKey[] {
  const recent = entries.slice(-WINDOW);
  const count = (tag: AiFeedbackTag) => recent.filter((entry) => entry.tags.includes(tag)).length;
  const wins = (tag: AiFeedbackTag, opposite: AiFeedbackTag) => count(tag) >= 2 && count(tag) > count(opposite);
  const keys: AiPreferenceKey[] = [];
  if (wins("shorter", "more_detail")) keys.push("brief");
  else if (wins("more_detail", "shorter")) keys.push("detailed");
  if (wins("generic", "good_option")) keys.push("concrete");
  if (wins("off_topic", "on_topic")) keys.push("stay_on_topic");
  if (wins("not_my_tone", "my_tone")) keys.push("change_tone");
  else if (wins("my_tone", "not_my_tone")) keys.push("keep_tone");
  const lastThree = recent.slice(-3);
  if (lastThree.length === 3 && lastThree.every((entry) => entry.rating <= 2)) keys.push("new_approach");
  return keys;
}

export function preferencePromptLines(keys: unknown): string[] {
  return Array.isArray(keys) ? [...new Set(keys.filter(isPreferenceKey))].map((key) => AI_PREFERENCE_PROMPTS[key]) : [];
}
