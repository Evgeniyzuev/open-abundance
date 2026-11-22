// "How your choices shape your life": the mini path after sign-in (docs/SIMPLE_CORE_LOOP_PLAN.md, founder 2026-11-22).
// A simple third-person character, 2–4 cards per choice; after a tap every card flips and shows its consequence, the
// character changes. Pure data and functions, no imports, so scripts/verify-life-choices-contract.mjs runs it directly.

export type LifeStat = "health" | "energy" | "money" | "people" | "skills" | "freedom";
export type LifeLook = "man" | "woman" | "other";
type Text = { ru: string; en: string };
export type LifeOption = { key: string; icon: string; label: Text; result: Text; effects: Partial<Record<LifeStat, number>> };
export type LifeScene = { key: string; icon: string; title: Text; options: LifeOption[] };

export const LIFE_STATS: readonly LifeStat[] = ["health", "energy", "money", "people", "skills", "freedom"];
export const LIFE_START = 5;
const MIN = 0;
const MAX = 10;

const t = (ru: string, en: string): Text => ({ ru, en });
const o = (key: string, icon: string, label: Text, result: Text, effects: LifeOption["effects"]): LifeOption => ({ key, icon, label, result, effects });

export const LIFE_SCENES: LifeScene[] = [
  { key: "food", icon: "🍽️", title: t("Еда", "Food"), options: [
    o("balance", "🥗", t("Вкусно, полезно и в меру", "Tasty, healthy, in measure"), t("Подтянутое тело и ясная кожа. Удовольствие каждый день", "A fit body and clear skin. Pleasure every day"), { health: 2, energy: 1 }),
    o("tasty", "🍔", t("Что вкусно, то и ем", "Whatever tastes good"), t("+15 кг к сорока, одышка на лестнице", "+15 kg by forty, out of breath on stairs"), { health: -2, energy: -1 }),
    o("run", "🥪", t("Что попадётся, на бегу", "Whatever, on the run"), t("Тусклая кожа и вечная усталость", "Dull skin and constant tiredness"), { health: -1, energy: -1 })
  ] },
  { key: "habits", icon: "🚬", title: t("Алкоголь и сигареты", "Alcohol and cigarettes"), options: [
    o("none", "💧", t("Не пью и не курю", "Neither"), t("Свежее лицо и ~$1 500 в год остаются у тебя", "A fresh face and ~$1,500 a year stay with you"), { health: 2, money: 1 }),
    o("rare", "🥂", t("Бокал по праздникам", "A glass on holidays"), t("Почти без следа", "Barely a trace"), {}),
    o("weekly", "🍺", t("Каждые выходные", "Every weekend"), t("Отёкшее лицо по понедельникам, минус выходной на восстановление", "Puffy Mondays and a day lost to recovery"), { health: -1, energy: -1, money: -1 }),
    o("smoke", "🚬", t("Пачка в день", "A pack a day"), t("Серая кожа, кашель и ~$2 000 в год в дым", "Grey skin, a cough and ~$2,000 a year up in smoke"), { health: -3, money: -1 })
  ] },
  { key: "sport", icon: "🏃", title: t("Движение", "Movement"), options: [
    o("gym", "🏋️", t("Спорт 3 раза в неделю", "Sport 3 times a week"), t("Прямая спина и силы до вечера", "Straight back and energy till evening"), { health: 2, energy: 2 }),
    o("walk", "🚶", t("Хожу пешком", "I walk"), t("Держишься в форме без подвигов", "Staying in shape without heroics"), { health: 1 }),
    o("sofa", "🛋️", t("Диван", "The sofa"), t("Спина болит уже в 35, живот растёт", "Back pain by 35, a growing belly"), { health: -2, energy: -1 })
  ] },
  { key: "phone", icon: "📱", title: t("Вечер с телефоном", "Evenings and the phone"), options: [
    o("sleep", "😴", t("Телефон вне спальни, сон 8 часов", "Phone out of the bedroom, 8 hours of sleep"), t("Ясная голова утром", "A clear head in the morning"), { energy: 2, health: 1 }),
    o("scroll", "🌀", t("Листаю ленту до двух ночи", "Scrolling till 2 am"), t("4 часа в день, это 2 месяца в год в ленте", "4 hours a day, 2 months a year in the feed"), { energy: -2, freedom: -1 })
  ] },
  { key: "learn", icon: "📚", title: t("Учёба", "Learning"), options: [
    o("daily", "🧠", t("Учусь каждый день, ИИ помогает", "Learning daily with AI"), t("Через 3 года тебя зовут, а не ты просишься", "In 3 years they call you, not the other way"), { skills: 3 }),
    o("job", "💼", t("Только то, что нужно на работе", "Only what work needs"), t("Держишься на месте", "Staying where you are"), { skills: 1 }),
    o("done", "🚫", t("Отучился, хватит", "Done with school"), t("Профессию заменяет ИИ, доход падает", "AI replaces your job, income falls"), { skills: -2, money: -1 })
  ] },
  { key: "people", icon: "👥", title: t("Люди вокруг", "People around"), options: [
    o("circle", "🫂", t("Свои люди, встречаемся", "My people, we meet"), t("Есть кому позвонить в три часа ночи", "Someone to call at 3 am"), { people: 3, energy: 1 }),
    o("online", "💬", t("Только онлайн", "Online only"), t("Сотни лайков и пустые выходные", "Hundreds of likes and empty weekends"), { people: -1 }),
    o("alone", "🚪", t("Сам по себе", "On my own"), t("Тишина, которая со временем давит", "A silence that weighs more each year"), { people: -3 })
  ] },
  { key: "money", icon: "💰", title: t("Деньги", "Money"), options: [
    o("invest", "📈", t("Откладываю 10% и вкладываю", "Save 10% and invest"), t("К сорока свой капитал и спокойный сон", "Own capital and calm sleep by forty"), { money: 3, freedom: 1 }),
    o("spend", "🛍️", t("Трачу всё", "Spend it all"), t("В сорок с нуля, как в двадцать", "At forty starting from zero, like at twenty"), { money: -1 }),
    o("credit", "💳", t("Кредиты на хотелки", "Loans for wants"), t("Работаешь на банк, а не на себя", "Working for the bank, not for yourself"), { money: -3, freedom: -2 })
  ] },
  { key: "work", icon: "🧭", title: t("Работа", "Work"), options: [
    o("hire", "🏢", t("Найм", "A job"), t("Стабильный доход, чужой график", "Stable pay, someone else's schedule"), { money: 2, freedom: -1 }),
    o("business", "🚀", t("Своё дело", "My own business"), t("Риск, свобода и доход без потолка", "Risk, freedom and income without a ceiling"), { freedom: 3, money: 1, energy: -1 }),
    o("create", "🎨", t("Творчество", "Creative work"), t("Делаешь то, что любишь, доход пока нестабилен", "Doing what you love, income still uneven"), { freedom: 2, energy: 1, money: -1 }),
    o("both", "🌗", t("Работа и своё по вечерам", "A job plus my own thing at night"), t("Медленно, но надёжно растёт своё", "Your own thing grows slowly but surely"), { money: 1, skills: 1, freedom: 1 })
  ] }
];

export type LifeAnswers = Record<string, string>;
export type LifeStats = Record<LifeStat, number>;

export function lifeStats(answers: LifeAnswers): LifeStats {
  const stats = Object.fromEntries(LIFE_STATS.map((stat) => [stat, LIFE_START])) as LifeStats;
  for (const scene of LIFE_SCENES) {
    const option = scene.options.find((item) => item.key === answers[scene.key]);
    if (!option) continue;
    for (const [stat, delta] of Object.entries(option.effects) as Array<[LifeStat, number]>) {
      stats[stat] = Math.max(MIN, Math.min(MAX, stats[stat] + delta));
    }
  }
  return stats;
}

/** What the character looks like for the stats: body width, skin tone, glow and the things around. */
export function lifeLook(stats: LifeStats) {
  return {
    bodyWidth: 30 + Math.max(0, LIFE_START - stats.health) * 5,
    healthy: stats.health >= LIFE_START,
    glow: stats.energy >= 7,
    tired: stats.energy <= 3,
    friends: stats.people >= 7 ? 2 : stats.people >= LIFE_START ? 1 : 0,
    books: stats.skills >= 7,
    coins: stats.money >= 7 ? 3 : stats.money >= LIFE_START ? 1 : 0,
    debt: stats.money <= 2,
    free: stats.freedom >= 7
  };
}

const WISH_BY_WORK: Record<string, Text> = {
  hire: t("Доход, который растёт без смены работы", "Income that grows without changing jobs"),
  business: t("Первый клиент своего дела", "The first client of my own business"),
  create: t("Первая продажа своего творчества", "The first sale of my creative work"),
  both: t("Своё дело хотя бы на пару дней в неделю", "My own thing at least a couple of days a week")
};

const STAT_NAME: Record<LifeStat, Text> = {
  health: t("Здоровье", "Health"),
  energy: t("Силы", "Energy"),
  money: t("Деньги", "Money"),
  people: t("Люди", "People"),
  skills: t("Навыки", "Skills"),
  freedom: t("Свобода", "Freedom")
};

const pick = (text: Text, locale: string) => (locale === "ru" ? text.ru : text.en);

export function lifeText(text: Text, locale: string): string {
  return pick(text, locale);
}

export function statName(stat: LifeStat, locale: string): string {
  return pick(STAT_NAME[stat], locale);
}

/** The weakest area (the place to start) and the wish from the work choice. */
export function lifeSummary(answers: LifeAnswers, locale: string) {
  const stats = lifeStats(answers);
  const weakest = [...LIFE_STATS].sort((a, b) => stats[a] - stats[b])[0];
  const strongest = [...LIFE_STATS].sort((a, b) => stats[b] - stats[a])[0];
  return { stats, weakest, strongest, wish: pick(WISH_BY_WORK[answers.work] ?? WISH_BY_WORK.both, locale) };
}

/** The growth-path motive saved for the first quest (lib/questPath.ts QUEST_MOTIVES). */
export function lifeQuestMotives(answers: LifeAnswers): Array<"income" | "path" | "change" | "learn" | "wish"> {
  const work = answers.work;
  const first = work === "hire" ? "income" : work === "create" ? "change" : "path";
  return answers.learn === "daily" ? [first, "learn"] : [first, "wish"];
}

export const LIFE_UI: Record<string, Text> = {
  lookTitle: t("Кто ты в этой игре?", "Who are you in this game?"),
  man: t("Мужчина", "Man"),
  woman: t("Женщина", "Woman"),
  other: t("Другое", "Other"),
  intro: t("Посмотри, как выбор меняет жизнь", "See how choices change a life"),
  step: t("{n} из {total}", "{n} of {total}"),
  next: t("Дальше", "Next"),
  finalTitle: t("Ты через 10 лет", "You in 10 years"),
  start: t("Начать с этого", "Start here"),
  weakest: t("Слабое место: {stat}. С него и начнём, по шагу в день", "Weak spot: {stat}. We start there, one step a day"),
  wish: t("Желание: {wish}", "Wish: {wish}"),
  replay: t("Пройти иначе", "Play again")
};

export function lifeUi(key: keyof typeof LIFE_UI, locale: string, values: Record<string, string | number> = {}): string {
  let text = pick(LIFE_UI[key], locale);
  for (const [name, value] of Object.entries(values)) text = text.replace(`{${name}}`, String(value));
  return text;
}

const FLAG_KEY = "oa.storyEntry";

/** The mini path replaces the first-step question where turned on: /?story=1 (QA and the founder) for now. */
export function lifeChoicesEnabled(search: string, read: (key: string) => string | null, write: (key: string, value: string) => void): boolean {
  const flag = new URLSearchParams(search).get("story");
  if (flag === "1" || flag === "0") write(FLAG_KEY, flag);
  return (flag ?? read(FLAG_KEY)) === "1";
}

export const LIFE_STORAGE = { flag: FLAG_KEY, result: "oa.lifeChoices" } as const;
