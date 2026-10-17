// Pure rules of the challenge thumbnails (no imports, tested directly by node).
// A challenge without its own picture gets a drawn cover: the colour of its category, a glyph chosen for what
// the challenge asks for, a glow whose place and hue shift come from the challenge id (so neighbours differ),
// and a number badge for the numbered series. A few challenges use the 3D milestone art.

/** One glyph per kind of check, so two challenges only look alike when they ask for the same thing. */
export const CHALLENGE_GLYPHS: Record<string, string> = {
  signup: "👋",
  has_wish: "⭐",
  wish_steps_created: "🪜",
  profile_strengths_filled: "💪",
  skill_profile_completed: "🗝️",
  attention_value_audit: "⏳",
  core_law_understood: "📈",
  three_day_focus: "🎯",
  today_completion_streak_7: "🗓️",
  today_completion_total_30: "🏁",
  daily_goal_half_streak_3: "🌗",
  daily_goal_half_streak_7: "🌓",
  daily_goal_full_total_7: "🌕",
  day_2_return: "🌅",
  calculate_time_to_goal: "🗺️",
  reinvest_enabled: "🔁",
  today_core_target_reached: "🎯",
  first_wallet_to_core: "🌱",
  afterburn_over_5: "🚀",
  first_wallet_transfer: "💸",
  first_growth_post_published: "✍️",
  app_testing_review: "🧪",
  app_testing_feedback: "🧪",
  ai_message_sent: "🤖",
  niche_task_chosen: "🧭",
  humanity_confirmed: "🛡️",
  referral_program: "🤝",
  has_referral: "🎁",
  team_contact_active: "👥",
  team_task_help_completed: "🫶",
  "trust_event_confirmed:help_given": "🤲",
  "trust_event_confirmed:proof_added": "✅",
  first_marketplace_listing: "🏪",
  first_sale: "🎉",
  sales_total_10: "💵",
  sales_total_100: "💰",
  sales_total_1000: "🏆",
  first_wish_fulfilled: "🌠",
  first_team_task_done: "🧩",
  peer_reviews: "🔍",
  install_ping_answered: "📲",
  acquisition_publications_milestone: "📣",
  acquisition_metric_views: "👀",
  acquisition_metric_reactions: "❤️",
  acquisition_metric_comments: "💬"
};

const CATEGORY_GLYPHS: Record<string, string> = {
  self_discovery: "🧭",
  core_education: "📚",
  start_path: "🚀",
  marketplace: "🏪",
  trust: "🛡️",
  social: "🤝",
  focus: "🎯",
  ai_assistant: "🤖",
  skills: "🗝️",
  finance: "💰",
  quality_assurance: "🧪",
  acquisition: "📣"
};

export function challengeGlyph(logic: string | null | undefined, category: string | null | undefined): string | null {
  if (logic && CHALLENGE_GLYPHS[logic]) return CHALLENGE_GLYPHS[logic];
  if (logic?.startsWith("acquisition_")) return "📣";
  return (category && CATEGORY_GLYPHS[category]) || null;
}

/** The 3D milestone art that fits a check; used only when the challenge has no picture of its own. */
export const MILESTONE_COVERS: Record<string, string> = {
  today_completion_streak_7: "/milestones/seven-day-rhythm.webp",
  today_completion_total_30: "/milestones/today-done.webp",
  day_2_return: "/milestones/first-light.webp",
  "trust_event_confirmed:help_given": "/milestones/help-someone.webp",
  team_task_help_completed: "/milestones/help-someone.webp"
};

export function challengeCover(logic: string | null | undefined): string | null {
  return (logic && MILESTONE_COVERS[logic]) || null;
}

/** Our own pictures (the app's files and R2) are used as they are; a hotlink to another site is replaced by the drawn cover. */
export function isOwnImage(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".r2.dev") || host === "open-abundance.vercel.app";
  } catch {
    return false;
  }
}

const NUMBER_WORDS: Array<[RegExp, number]> = [
  [/двенадцат|twelve/i, 12],
  [/пятьдесят|fifty/i, 50],
  [/двадцат|twenty/i, 20],
  [/(^|[^а-яё])десят|\bten\b/i, 10],
  [/(^|[^а-яё])пять(?![а-яё])|\bfive\b/i, 5],
  [/шест[ьи]|six/i, 6],
  [/(^|[^а-яё])три(?![а-яё])|трёх|трех|three/i, 3],
  [/перв(ая|ый|ое|ую)|first/i, 1]
];

/** A short number for the numbered series ("1", "3", "12", "1K"), taken from the title; null when there is none. */
export function challengeBadge(title: string | null | undefined): string | null {
  if (!title) return null;
  const digits = title.match(/\d[\d\s ]*/);
  if (digits) {
    const value = Number(digits[0].replace(/[\s ]/g, ""));
    if (Number.isFinite(value) && value > 0) return value >= 1000 && value % 1000 === 0 ? `${value / 1000}K` : String(value);
  }
  for (const [pattern, value] of NUMBER_WORDS) if (pattern.test(title)) return String(value);
  return null;
}

/** A stable look for one challenge: hue shift in degrees and the place of the glow in percent. */
export function artSeed(id: string): { shift: number; x: number; y: number } {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return { shift: (hash % 61) - 30, x: 18 + ((hash >>> 8) % 45), y: 12 + ((hash >>> 16) % 35) };
}
