// Pure rules of the challenge thumbnails (no imports, tested directly by node).
// A challenge without its own picture gets a drawn cover: the colour of its category, an icon chosen for what
// the challenge asks for, a glow whose place and hue shift come from the challenge id (so neighbours differ),
// and a number badge for the numbered series. A few challenges use the 3D milestone art.

/** One icon per kind of check (the name of a lucide icon), so two challenges only look alike when they ask for the same thing. */
export const CHALLENGE_GLYPHS: Record<string, string> = {
  "signup": "Hand",
  "has_wish": "Star",
  "wish_steps_created": "Footprints",
  "profile_strengths_filled": "Dumbbell",
  "skill_profile_completed": "KeyRound",
  "attention_value_audit": "Hourglass",
  "core_law_understood": "TrendingUp",
  "three_day_focus": "Target",
  "today_completion_streak_7": "CalendarCheck",
  "today_completion_total_30": "Flag",
  "daily_goal_half_streak_3": "SunDim",
  "daily_goal_half_streak_7": "SunMedium",
  "daily_goal_full_total_7": "Sun",
  "day_2_return": "Sunrise",
  "calculate_time_to_goal": "Map",
  "reinvest_enabled": "Repeat",
  "today_core_target_reached": "Target",
  "first_wallet_to_core": "Sprout",
  "afterburn_over_5": "Flame",
  "first_wallet_transfer": "Send",
  "first_growth_post_published": "PenLine",
  "app_testing_review": "FlaskConical",
  "app_testing_feedback": "FlaskConical",
  "ai_message_sent": "Bot",
  "niche_task_chosen": "Compass",
  "values_goals_defined": "Heart",
  "humanity_confirmed": "ShieldCheck",
  "referral_program": "Handshake",
  "referrals_confirmed_1": "UserCheck",
  "referrals_confirmed_10": "UserPlus",
  "referrals_confirmed_50": "Medal",
  "referrals_confirmed_100": "Crown",
  "has_referral": "Gift",
  "team_contact_active": "Users",
  "team_task_help_completed": "HeartHandshake",
  "trust_event_confirmed:help_given": "HandHelping",
  "trust_event_confirmed:proof_added": "BadgeCheck",
  "first_marketplace_listing": "Store",
  "first_sale": "PartyPopper",
  "business_second_buyer": "UsersRound",
  "business_reviews_3": "MessageSquareHeart",
  "business_stranger_buyer": "Globe",
  "business_external_buyer": "Link2",
  "first_internal_purchase": "ShoppingBag",
  "sales_total_10": "Banknote",
  "sales_total_100": "Coins",
  "sales_total_1000": "Trophy",
  "first_wish_fulfilled": "Sparkles",
  "first_team_task_done": "Puzzle",
  "peer_reviews": "ScanSearch",
  "install_ping_answered": "Smartphone",
  "acquisition_publications_milestone": "Megaphone",
  "acquisition_metric_views": "Eye",
  "acquisition_metric_reactions": "Heart",
  "acquisition_metric_comments": "MessageCircle"
};

const CATEGORY_GLYPHS: Record<string, string> = {
  self_discovery: "Compass",
  core_education: "BookOpen",
  start_path: "Rocket",
  marketplace: "Store",
  trust: "ShieldCheck",
  social: "Handshake",
  focus: "Target",
  ai_assistant: "Bot",
  skills: "KeyRound",
  finance: "Coins",
  quality_assurance: "FlaskConical",
  acquisition: "Megaphone"
};

/** The name of the icon that fits the check (or its category); null when nothing fits. */
export function challengeGlyph(logic: string | null | undefined, category: string | null | undefined): string | null {
  if (logic && CHALLENGE_GLYPHS[logic]) return CHALLENGE_GLYPHS[logic];
  if (logic?.startsWith("acquisition_")) return "Megaphone";
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
