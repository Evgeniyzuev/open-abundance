// The Open Abundance lead (docs/SMALL_WISHES_AND_LEADS_PLAN.md, stage 5): a weekly rhythm built from mentor and coach
// practices. Monday: one goal for the week. Mid-week: "how is it going?". Friday to Sunday: the result. Each person
// gets one practice card a week; every tenth person gets the rhythm without a card (control group), so the analytics
// can see which practices help. Live leads get the practice of the week as a ready kit to pass to their followers.
// Pure and standalone (no imports) so the analytics script and the Nova job can import it.

const DAY_MS = 86_400_000;

type Text = { ru: string; en: string };

export type LeadPractice = {
  key: string;
  title: Text;
  /** What to do this week, in one or two sentences. */
  how: Text;
  /** Where it comes from, so leads can read more. */
  source: string;
};

export const LEAD_PRACTICES: LeadPractice[] = [
  {
    key: "woop",
    title: { ru: "Желание, результат, препятствие, план", en: "Wish, outcome, obstacle, plan" },
    how: {
      ru: "Представь результат недели, назови главное препятствие и запиши: «Если случится X, я сделаю Y».",
      en: "Picture the week's result, name the main obstacle and write: \"If X happens, I will do Y\"."
    },
    source: "WOOP, Gabriele Oettingen"
  },
  {
    key: "when_then",
    title: { ru: "Когда-тогда", en: "When-then" },
    how: {
      ru: "Привяжи шаг к месту и времени: «Когда я допью утренний чай, я сделаю 10 минут работы над целью».",
      en: "Tie the step to a time and place: \"When I finish my morning tea, I'll spend 10 minutes on my goal\"."
    },
    source: "Implementation intentions, Peter Gollwitzer"
  },
  {
    key: "two_minutes",
    title: { ru: "Правило двух минут", en: "The two-minute rule" },
    how: {
      ru: "Начни с версии шага, которая занимает две минуты. Главное в эту неделю не объём, а то, что ты начинаешь каждый день.",
      en: "Start with a version of the step that takes two minutes. This week the point is starting every day, not the amount."
    },
    source: "Atomic Habits, James Clear"
  },
  {
    key: "partner",
    title: { ru: "Партнёр по ответственности", en: "Accountability partner" },
    how: {
      ru: "Скажи одному человеку свою цель недели и договорись, что в пятницу расскажешь ему итог.",
      en: "Tell one person your goal for the week and agree to tell them the result on Friday."
    },
    source: "Accountability in coaching practice"
  },
  {
    key: "small_wins",
    title: { ru: "Маленькие победы", en: "Small wins" },
    how: {
      ru: "Каждый вечер запиши одну вещь, которая сегодня сдвинулась. Даже маленькую.",
      en: "Every evening, write down one thing that moved today. Even a small one."
    },
    source: "The Progress Principle, Teresa Amabile"
  },
  {
    key: "public_promise",
    title: { ru: "Обещание вслух", en: "A promise out loud" },
    how: {
      ru: "Напиши цель недели в ленту или своему кругу. В пятницу покажи, что получилось.",
      en: "Post your goal for the week in the feed or to your circle. On Friday, show what worked."
    },
    source: "Commitment and consistency, Robert Cialdini"
  },
  {
    key: "grow",
    title: { ru: "Четыре вопроса наставника", en: "A mentor's four questions" },
    how: {
      ru: "Ответь себе: чего я хочу к пятнице? Где я сейчас? Какие есть варианты? Что я сделаю первым?",
      en: "Ask yourself: what do I want by Friday? Where am I now? What are the options? What will I do first?"
    },
    source: "GROW model, John Whitmore"
  }
];

export const CONTROL_PRACTICE = "none";
export const LEAD_CONTROL_SHARE = 10;

export type WeekPhase = "goal" | "midweek" | "review";

/** Monday 00:00 UTC of the week that contains `now`, as YYYY-MM-DD. */
export function weekStart(now: number): string {
  const date = new Date(now);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - day * DAY_MS;
  return new Date(monday).toISOString().slice(0, 10);
}

/** Monday-Tuesday: set the goal; Wednesday-Thursday: how is it going; Friday-Sunday: the result. */
export function weekPhase(now: number): WeekPhase {
  const day = (new Date(now).getUTCDay() + 6) % 7;
  if (day <= 1) return "goal";
  if (day <= 3) return "midweek";
  return "review";
}

function weekNumber(start: string): number {
  return Math.floor(Date.parse(`${start}T00:00:00Z`) / (7 * DAY_MS));
}

function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result;
}

/** Stable 1-in-10 control group for the lead's practices (its own salt, separate from the Nova message holdout). */
export function isLeadControl(userId: string): boolean {
  return hash(`lead-practice:${userId}`) % LEAD_CONTROL_SHARE === 0;
}

/** This person's practice for the week, or CONTROL_PRACTICE. Rotates weekly, people start at different cards. */
export function practiceKeyFor(userId: string, start: string): string {
  if (isLeadControl(userId)) return CONTROL_PRACTICE;
  return LEAD_PRACTICES[(hash(userId) + weekNumber(start)) % LEAD_PRACTICES.length].key;
}

export function practiceByKey(key: string | null | undefined): LeadPractice | null {
  return LEAD_PRACTICES.find((practice) => practice.key === key) ?? null;
}

/** The practice of the week for live leads to pass on: the same for every lead in a given week. */
export function kitPracticeFor(start: string): LeadPractice {
  return LEAD_PRACTICES[weekNumber(start) % LEAD_PRACTICES.length];
}

/** A ready message a live lead can send to their followers. */
export function kitMessage(practice: LeadPractice, locale: string): string {
  const ru = locale === "ru";
  const how = ru ? practice.how.ru : practice.how.en;
  return ru
    ? `Практика этой недели: «${practice.title.ru}». ${how} Напиши мне свою цель на неделю, а в пятницу расскажи, что получилось.`
    : `This week's practice: "${practice.title.en}". ${how} Send me your goal for the week, and on Friday tell me how it went.`;
}

export const WEEK_GOAL_MAX = 200;
export const WEEK_NOTE_MAX = 400;
export const MIDWEEK_STATUSES = ["going", "stuck", "need_help"] as const;
export const REVIEW_STATUSES = ["done", "partly", "not_yet"] as const;
export type MidweekStatus = (typeof MIDWEEK_STATUSES)[number];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
