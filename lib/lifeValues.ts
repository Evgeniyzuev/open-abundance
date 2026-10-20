// Pure rules of the "values and goals" activity (no imports, tested directly by node).
// The activity lives in the feed and can be repeated: a life balance wheel (where I am and where I want to be,
// per sphere, with the criteria behind each score) and goal cards swiped right ("I want") or left ("not mine").
// A right swipe becomes a private wish. The challenge is passing it once: the wheel plus VALUES_CHALLENGE_SWIPES swipes.

export type LifeSphereKey = "health" | "finance" | "family" | "career" | "friends" | "growth" | "leisure" | "home";

type Text = { ru: string; en: string };

export type LifeSphere = { key: LifeSphereKey; emoji: string; title: Text; criteriaHint: Text };

export type GoalCard = { key: string; sphere: LifeSphereKey; emoji: string; title: Text; description: Text };

export type WheelScore = { now: number; want: number; criteria: string };
export type Wheel = Record<LifeSphereKey, WheelScore>;
export type SwipeDecision = "want" | "skip";

export const VALUES_CHALLENGE_SWIPES = 30;
export const WHEEL_MAX = 10;
export const CRITERIA_MAX_LENGTH = 200;

export const LIFE_SPHERES: LifeSphere[] = [
  { key: "health", emoji: "💪", title: { ru: "Здоровье", en: "Health" }, criteriaHint: { ru: "сон, энергия, вес, боли, анализы", en: "sleep, energy, weight, pain, checkups" } },
  { key: "finance", emoji: "💰", title: { ru: "Финансы", en: "Money" }, criteriaHint: { ru: "доход, долги, запас на сколько месяцев", en: "income, debts, months of savings" } },
  { key: "family", emoji: "🏡", title: { ru: "Семья и любовь", en: "Family and love" }, criteriaHint: { ru: "тепло, время вместе, ссоры, поддержка", en: "warmth, time together, conflicts, support" } },
  { key: "career", emoji: "🚀", title: { ru: "Работа и дело", en: "Work and career" }, criteriaHint: { ru: "интерес, рост, признание, смысл", en: "interest, growth, recognition, meaning" } },
  { key: "friends", emoji: "🤝", title: { ru: "Друзья и окружение", en: "Friends and circle" }, criteriaHint: { ru: "с кем можно поговорить, как часто видитесь", en: "who you can talk to, how often you meet" } },
  { key: "growth", emoji: "📚", title: { ru: "Развитие", en: "Personal growth" }, criteriaHint: { ru: "чему научились за месяц, книги, навыки", en: "what you learned this month, books, skills" } },
  { key: "leisure", emoji: "🎨", title: { ru: "Отдых и радость", en: "Rest and joy" }, criteriaHint: { ru: "хобби, отпуск, что радует каждую неделю", en: "hobbies, holidays, what brings joy each week" } },
  { key: "home", emoji: "🛋", title: { ru: "Дом и быт", en: "Home and surroundings" }, criteriaHint: { ru: "жильё, порядок, транспорт, место жизни", en: "housing, order, transport, where you live" } }
];

export const LIFE_SPHERE_KEYS = LIFE_SPHERES.map((sphere) => sphere.key);

export const GOAL_CARDS: GoalCard[] = [
  { key: "fitness", sphere: "health", emoji: "🏋️", title: { ru: "Лучшая физическая форма", en: "Get in better shape" }, description: { ru: "Тренироваться регулярно и чувствовать силу в теле", en: "Train regularly and feel strong" } },
  { key: "teeth", sphere: "health", emoji: "🦷", title: { ru: "Вылечить зубы", en: "Fix my teeth" }, description: { ru: "Пройти лечение и сохранить здоровую улыбку", en: "Get the treatment done and keep a healthy smile" } },
  { key: "sleep", sphere: "health", emoji: "😴", title: { ru: "Высыпаться", en: "Sleep well" }, description: { ru: "Ложиться вовремя и просыпаться бодрым", en: "Go to bed on time and wake up rested" } },
  { key: "checkup", sphere: "health", emoji: "🩺", title: { ru: "Пройти полное обследование", en: "Full health checkup" }, description: { ru: "Узнать, что с организмом, и заняться важным", en: "Find out how my body is doing and act on it" } },
  { key: "weight", sphere: "health", emoji: "⚖️", title: { ru: "Прийти к здоровому весу", en: "Reach a healthy weight" }, description: { ru: "Спокойно, без жёстких диет", en: "Calmly, without harsh diets" } },
  { key: "quit_habit", sphere: "health", emoji: "🚭", title: { ru: "Бросить вредную привычку", en: "Quit a bad habit" }, description: { ru: "Курение, сладкое, бесконечная лента", en: "Smoking, sugar, endless scrolling" } },
  { key: "savings", sphere: "finance", emoji: "🐷", title: { ru: "Запас на полгода", en: "Six months of savings" }, description: { ru: "Подушка, с которой не страшно", en: "A cushion that makes life calmer" } },
  { key: "debt_free", sphere: "finance", emoji: "🔓", title: { ru: "Закрыть долги и кредиты", en: "Be debt free" }, description: { ru: "Ни одного платежа по кредиту", en: "No loan payments at all" } },
  { key: "income_up", sphere: "finance", emoji: "📈", title: { ru: "Доход в два раза больше", en: "Double my income" }, description: { ru: "Выйти на новый уровень дохода", en: "Reach a new income level" } },
  { key: "passive_income", sphere: "finance", emoji: "🌱", title: { ru: "Пассивный доход", en: "Passive income" }, description: { ru: "Деньги, которые приходят без ежедневной работы", en: "Money that comes without daily work" } },
  { key: "family_time", sphere: "family", emoji: "👨‍👩‍👧", title: { ru: "Больше времени с семьёй", en: "More time with family" }, description: { ru: "Регулярные вечера и выходные вместе", en: "Regular evenings and weekends together" } },
  { key: "partner", sphere: "family", emoji: "❤️", title: { ru: "Встретить свою любовь", en: "Find my love" }, description: { ru: "Отношения, в которых тепло", en: "A warm relationship" } },
  { key: "children", sphere: "family", emoji: "👶", title: { ru: "Ребёнок", en: "Have a child" }, description: { ru: "Стать родителем или ещё раз", en: "Become a parent, or again" } },
  { key: "parents_help", sphere: "family", emoji: "🤲", title: { ru: "Помочь родителям", en: "Help my parents" }, description: { ru: "Ремонт, лечение, поездка для них", en: "Repairs, treatment or a trip for them" } },
  { key: "wedding", sphere: "family", emoji: "💍", title: { ru: "Свадьба", en: "A wedding" }, description: { ru: "Праздник, который запомнится", en: "A celebration to remember" } },
  { key: "own_business", sphere: "career", emoji: "🏪", title: { ru: "Своё дело", en: "My own business" }, description: { ru: "Запустить и дорастить до прибыли", en: "Launch it and make it profitable" } },
  { key: "better_job", sphere: "career", emoji: "💼", title: { ru: "Работа мечты", en: "Dream job" }, description: { ru: "Дело, которое нравится и хорошо оплачивается", en: "Work I enjoy that pays well" } },
  { key: "promotion", sphere: "career", emoji: "🏅", title: { ru: "Повышение", en: "A promotion" }, description: { ru: "Новая должность и ответственность", en: "A new role and responsibility" } },
  { key: "remote_work", sphere: "career", emoji: "💻", title: { ru: "Работать из любой точки мира", en: "Work from anywhere" }, description: { ru: "Удалённая работа или свой онлайн-проект", en: "Remote work or my own online project" } },
  { key: "new_friends", sphere: "friends", emoji: "🫂", title: { ru: "Найти близких друзей", en: "Find close friends" }, description: { ru: "Люди, с которыми легко и честно", en: "People I can be honest and easy with" } },
  { key: "community", sphere: "friends", emoji: "🌍", title: { ru: "Своё сообщество", en: "My community" }, description: { ru: "Круг людей с общими целями", en: "A circle of people with shared goals" } },
  { key: "volunteer", sphere: "friends", emoji: "🙌", title: { ru: "Помогать другим", en: "Help others" }, description: { ru: "Волонтёрство или наставничество", en: "Volunteering or mentoring" } },
  { key: "reconnect", sphere: "friends", emoji: "📞", title: { ru: "Вернуть старых друзей", en: "Reconnect with old friends" }, description: { ru: "Встретиться с теми, кого давно не видел", en: "Meet people I have not seen for years" } },
  { key: "language", sphere: "growth", emoji: "🗣", title: { ru: "Выучить язык", en: "Learn a language" }, description: { ru: "Свободно говорить на новом языке", en: "Speak a new language freely" } },
  { key: "new_skill", sphere: "growth", emoji: "🧠", title: { ru: "Освоить новую профессию", en: "Master a new profession" }, description: { ru: "Программирование, дизайн, ремесло", en: "Programming, design, a craft" } },
  { key: "education", sphere: "growth", emoji: "🎓", title: { ru: "Получить образование", en: "Get a degree or course" }, description: { ru: "Диплом, сертификат или сильный курс", en: "A degree, certificate or strong course" } },
  { key: "reading", sphere: "growth", emoji: "📖", title: { ru: "Читать 20 книг в год", en: "Read 20 books a year" }, description: { ru: "Книги, которые меняют мышление", en: "Books that change how I think" } },
  { key: "public_speaking", sphere: "growth", emoji: "🎤", title: { ru: "Не бояться выступать", en: "Speak in public with ease" }, description: { ru: "Уверенно говорить перед людьми", en: "Talk confidently in front of people" } },
  { key: "travel", sphere: "leisure", emoji: "✈️", title: { ru: "Путешествие мечты", en: "Dream trip" }, description: { ru: "Страна или место, куда давно хочется", en: "A country or place I have long wanted to see" } },
  { key: "sea", sphere: "leisure", emoji: "🏖", title: { ru: "Отпуск на море", en: "A beach holiday" }, description: { ru: "Две недели солнца и отдыха", en: "Two weeks of sun and rest" } },
  { key: "hobby", sphere: "leisure", emoji: "🎸", title: { ru: "Хобби для души", en: "A hobby I love" }, description: { ru: "Музыка, рисование, танцы", en: "Music, drawing, dancing" } },
  { key: "concert", sphere: "leisure", emoji: "🎟", title: { ru: "Концерт или фестиваль", en: "A concert or festival" }, description: { ru: "Увидеть вживую любимого артиста", en: "See my favorite artist live" } },
  { key: "mountains", sphere: "leisure", emoji: "🏔", title: { ru: "Поход в горы", en: "A mountain hike" }, description: { ru: "Подняться на вершину", en: "Reach a summit" } },
  { key: "new_home", sphere: "home", emoji: "🏠", title: { ru: "Новое жильё", en: "A new home" }, description: { ru: "Своя квартира или дом", en: "My own apartment or house" } },
  { key: "car", sphere: "home", emoji: "🚗", title: { ru: "Новый автомобиль", en: "A new car" }, description: { ru: "Надёжная машина для себя и семьи", en: "A reliable car for me and my family" } },
  { key: "renovation", sphere: "home", emoji: "🛠", title: { ru: "Ремонт", en: "Renovation" }, description: { ru: "Дом, в котором приятно жить", en: "A home that feels good to live in" } },
  { key: "move_city", sphere: "home", emoji: "🧭", title: { ru: "Переехать", en: "Move to a new place" }, description: { ru: "Город или страна, где лучше", en: "A city or country that suits me better" } },
  { key: "declutter", sphere: "home", emoji: "🧺", title: { ru: "Порядок и минимум лишнего", en: "Order and less clutter" }, description: { ru: "Избавиться от ненужного", en: "Get rid of what I do not need" } },
  { key: "garden", sphere: "home", emoji: "🌻", title: { ru: "Свой сад или дача", en: "My own garden" }, description: { ru: "Земля, растения, тишина", en: "Land, plants, quiet" } },
  { key: "pet", sphere: "home", emoji: "🐕", title: { ru: "Домашний питомец", en: "A pet" }, description: { ru: "Собака, кошка или кто-то ещё", en: "A dog, a cat or someone else" } }
];

const CARD_BY_KEY = new Map(GOAL_CARDS.map((card) => [card.key, card]));

export function goalCard(key: unknown): GoalCard | null {
  return typeof key === "string" ? CARD_BY_KEY.get(key) ?? null : null;
}

export function emptyWheel(): Wheel {
  return Object.fromEntries(LIFE_SPHERE_KEYS.map((key) => [key, { now: 5, want: 8, criteria: "" }])) as Wheel;
}

/** A complete wheel: every sphere scored 0–10, criteria trimmed. At least one criterion is required. */
export function normalizeWheel(value: unknown): Wheel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const wheel = {} as Wheel;
  for (const key of LIFE_SPHERE_KEYS) {
    const row = source[key];
    if (!row || typeof row !== "object") return null;
    const { now, want, criteria } = row as Record<string, unknown>;
    if (!isScore(now) || !isScore(want)) return null;
    wheel[key] = { now, want, criteria: typeof criteria === "string" ? criteria.trim().slice(0, CRITERIA_MAX_LENGTH) : "" };
  }
  if (!LIFE_SPHERE_KEYS.some((key) => wheel[key].criteria.length >= 3)) return null;
  return wheel;
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= WHEEL_MAX;
}

/**
 * Cards in the order to show them: unseen first, spheres with the largest gap (want − now) first,
 * taking one card per sphere in turn so the deck does not open with a block of one topic.
 */
export function orderGoalCards(wheel: Wheel | null, decided: ReadonlySet<string>): GoalCard[] {
  const gap = (sphere: LifeSphereKey) => (wheel ? wheel[sphere].want - wheel[sphere].now : 0);
  const spheres = [...LIFE_SPHERE_KEYS].sort((left, right) => gap(right) - gap(left));
  const queues = spheres.map((sphere) => GOAL_CARDS.filter((card) => card.sphere === sphere && !decided.has(card.key)));
  const ordered: GoalCard[] = [];
  for (let round = 0; queues.some((queue) => queue.length > round); round += 1) {
    for (const queue of queues) if (queue[round]) ordered.push(queue[round]);
  }
  return ordered;
}

export function valuesChallengeDone(state: { wheelSaved: boolean; swipeCount: number }): boolean {
  return state.wheelSaved && state.swipeCount >= VALUES_CHALLENGE_SWIPES;
}
