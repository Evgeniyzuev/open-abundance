// Small wishes that can really be fulfilled at the first stage (Evgen, 2026-10-27): help between people,
// a new habit with Nova and the community, or a small sum. Offered gently in the Wishes tab, one card,
// three options. Standalone (relative import only) so the daily analytics can match wishes to keys.
import { coreIncome, WISH_SIZE_DAYS } from "./wishPrice.ts";

export type SmallWishKind = "help" | "habit" | "money";

type Text = { ru: string; en: string };

export type SmallWish = {
  key: string;
  kind: SmallWishKind;
  emoji: string;
  category: string;
  /** USD; 0 for wishes fulfilled without money. */
  price: number;
  /** Habit length in days; null for one-off wishes. */
  days: number | null;
  title: Text;
  description: Text;
  /** How Open Abundance fulfils it: the practice we follow. */
  fulfil: Text;
};

const HELP_FULFIL: Text = {
  ru: "Нова найдёт участника, который готов помочь, и познакомит вас, если вы оба согласны.",
  en: "Nova finds a member who is ready to help and introduces you if you both agree."
};

const HABIT_FULFIL: Text = {
  ru: "Нова коротко спросит раз в день, как идёт. Отметки видят только те, кому ты разрешишь. В конце итог и история в ленте, если захочешь.",
  en: "Nova asks once a day how it goes. Only the people you allow see your check-ins. At the end, a summary and a feed story if you want."
};

const MONEY_FULFIL: Text = {
  ru: "Исполняется из дохода Core, когда его хватает, или из фонда желаний после вклада: «Я не робот», приглашённые, помощь другим.",
  en: "Paid from Core income once it covers the price, or from the wish fund after you contribute: \"I'm not a robot\", invited friends, helping others."
};

export const SMALL_WISHES: SmallWish[] = [
  {
    key: "help.project_feedback", kind: "help", emoji: "💬", category: "Creativity", price: 0, days: null,
    title: { ru: "Честный отзыв о моём проекте", en: "Honest feedback on my project" },
    description: { ru: "Три участника посмотрят мой проект и скажут, что улучшить", en: "Three members look at my project and say what to improve" },
    fulfil: HELP_FULFIL
  },
  {
    key: "help.walk_partner", kind: "help", emoji: "🚶", category: "Health", price: 0, days: null,
    title: { ru: "Напарник для прогулок или пробежек", en: "A walking or running partner" },
    description: { ru: "Неделю выходить вместе с напарником (рядом или по видеосвязи)", en: "Go out with a partner for a week (nearby or on a video call)" },
    fulfil: HELP_FULFIL
  },
  {
    key: "help.one_hour_skill", kind: "help", emoji: "🎓", category: "Education", price: 0, days: null,
    title: { ru: "Научиться одной вещи за час", en: "Learn one thing in an hour" },
    description: { ru: "Участник, который умеет, покажет за час по видеосвязи", en: "A member who knows how shows me in an hour on a video call" },
    fulfil: HELP_FULFIL
  },
  {
    key: "help.cv_review", kind: "help", emoji: "📄", category: "Career", price: 0, days: null,
    title: { ru: "Разобрать моё резюме", en: "Review my CV" },
    description: { ru: "Опытный участник подскажет, как сделать резюме сильнее", en: "An experienced member shows how to make my CV stronger" },
    fulfil: HELP_FULFIL
  },
  {
    key: "help.language_talk", kind: "help", emoji: "🗣️", category: "Education", price: 0, days: null,
    title: { ru: "Поговорить на иностранном языке", en: "Practise a foreign language" },
    description: { ru: "20 минут разговора с носителем или тем, кто знает язык лучше", en: "A 20-minute talk with a native speaker or someone more fluent" },
    fulfil: HELP_FULFIL
  },
  {
    key: "habit.no_feed_night", kind: "habit", emoji: "🌙", category: "Self", price: 0, days: 14,
    title: { ru: "Две недели без ленты после 22:00", en: "Two weeks without feeds after 10 pm" },
    description: { ru: "Вечером вместо соцсетей сон, книга или разговор", en: "Sleep, a book or a talk instead of social feeds in the evening" },
    fulfil: HABIT_FULFIL
  },
  {
    key: "habit.daily_walk", kind: "habit", emoji: "🌿", category: "Health", price: 0, days: 21,
    title: { ru: "21 день прогулок по 10 минут", en: "21 days of 10-minute walks" },
    description: { ru: "Каждый день хотя бы 10 минут на улице", en: "At least 10 minutes outside every day" },
    fulfil: HABIT_FULFIL
  },
  {
    key: "habit.read_daily", kind: "habit", emoji: "📚", category: "Education", price: 0, days: 30,
    title: { ru: "30 дней по 10 страниц", en: "30 days of 10 pages" },
    description: { ru: "Читать по 10 страниц в день месяц подряд", en: "Read 10 pages a day for a month" },
    fulfil: HABIT_FULFIL
  },
  {
    key: "habit.phone_free_morning", kind: "habit", emoji: "☀️", category: "Self", price: 0, days: 14,
    title: { ru: "Утро без телефона", en: "Phone-free mornings" },
    description: { ru: "Две недели первый час после пробуждения без телефона", en: "For two weeks, the first hour after waking without the phone" },
    fulfil: HABIT_FULFIL
  },
  {
    key: "habit.weekly_progress_post", kind: "habit", emoji: "✍️", category: "Creativity", price: 0, days: 28,
    title: { ru: "Месяц делиться прогрессом", en: "Share progress for a month" },
    description: { ru: "Раз в неделю короткий пост о том, что получилось", en: "Once a week, a short post about what worked" },
    fulfil: HABIT_FULFIL
  },
  {
    key: "money.book", kind: "money", emoji: "📕", category: "Education", price: 15, days: null,
    title: { ru: "Книга, которую давно хочу", en: "A book I've wanted for a while" },
    description: { ru: "Бумажная или электронная, до $15", en: "Paper or e-book, up to $15" },
    fulfil: MONEY_FULFIL
  },
  {
    key: "money.course_month", kind: "money", emoji: "💻", category: "Education", price: 20, days: null,
    title: { ru: "Месяц онлайн-курса", en: "A month of an online course" },
    description: { ru: "Подписка на курс или сервис для учёбы, до $20", en: "A course or study service subscription, up to $20" },
    fulfil: MONEY_FULFIL
  },
  {
    key: "money.sport_gear", kind: "money", emoji: "👟", category: "Health", price: 25, days: null,
    title: { ru: "Маленькая вещь для спорта", en: "A small piece of sports gear" },
    description: { ru: "Скакалка, коврик, бутылка, до $25", en: "A jump rope, mat or bottle, up to $25" },
    fulfil: MONEY_FULFIL
  },
  {
    key: "money.gift_close", kind: "money", emoji: "🎁", category: "Relations", price: 20, days: null,
    title: { ru: "Подарок близкому человеку", en: "A gift for someone close" },
    description: { ru: "Порадовать близкого, до $20", en: "Make someone close happy, up to $20" },
    fulfil: MONEY_FULFIL
  },
  {
    key: "money.mentor_session", kind: "money", emoji: "🧭", category: "Career", price: 30, days: null,
    title: { ru: "Час с наставником", en: "An hour with a mentor" },
    description: { ru: "Платная консультация специалиста по моей цели, до $30", en: "A paid session with an expert on my goal, up to $30" },
    fulfil: MONEY_FULFIL
  }
];

const BY_KEY = new Map(SMALL_WISHES.map((wish) => [wish.key, wish]));

export function smallWishByKey(key: string): SmallWish | null {
  return BY_KEY.get(key) ?? null;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const BY_TITLE = new Map<string, SmallWish>();
for (const wish of SMALL_WISHES) {
  BY_TITLE.set(normalizeTitle(wish.title.ru), wish);
  BY_TITLE.set(normalizeTitle(wish.title.en), wish);
}

/** A saved wish matches a catalog entry by its title in any language. */
export function matchSmallWish(title: string | null | undefined): SmallWish | null {
  if (!title) return null;
  return BY_TITLE.get(normalizeTitle(title)) ?? null;
}

export function smallWishText(value: Text, locale: string): string {
  return locale === "ru" ? value.ru : value.en;
}

/** Simple string hash so offers rotate by day but stay stable within one day. */
function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) >>> 0;
  return result;
}

export type SmallWishOfferInput = {
  coreBalance: number;
  /** Categories of the person's own wishes, to put related options first. */
  categories: string[];
  /** Catalog keys the person already has. */
  ownedKeys: string[];
  /** Stable seed, e.g. user id + UTC day. */
  seed: string;
};

/** One option of each kind: help, habit, money. Related categories first; money that Core already covers first. */
export function pickSmallWishOffers(input: SmallWishOfferInput): SmallWish[] {
  const owned = new Set(input.ownedKeys);
  const categories = new Set(input.categories.map((value) => value.toLowerCase()));
  const monthIncome = coreIncome(input.coreBalance, WISH_SIZE_DAYS.medium);
  const offers: SmallWish[] = [];
  for (const kind of ["help", "habit", "money"] as const) {
    const pool = SMALL_WISHES.filter((wish) => wish.kind === kind && !owned.has(wish.key));
    if (!pool.length) continue;
    const scored = pool.map((wish) => ({
      wish,
      score: (categories.has(wish.category.toLowerCase()) ? 2 : 0)
        + (kind === "money" && wish.price <= monthIncome ? 1 : 0)
        + (hash(`${input.seed}:${wish.key}`) % 1000) / 1000
    }));
    scored.sort((left, right) => right.score - left.score);
    offers.push(scored[0].wish);
  }
  return offers;
}
