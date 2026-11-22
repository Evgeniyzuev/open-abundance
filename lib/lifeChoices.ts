// "How your choices shape your life": the mini path after sign-in (docs/SIMPLE_CORE_LOOP_PLAN.md, founder 2026-11-22).
// Eight spheres of life. Each starts with one card "does this touch you?"; an indifferent answer moves on, a sensitive
// one goes deeper (which direction), then Nova guesses the wish ("Can we say you want X but Y stopped you?"), and on
// "not quite" asks what really stops. Every card flips to its consequence and the simple character changes.
// Pure data and functions, no imports, so scripts/verify-life-choices-contract.mjs runs it directly.

export type LifeStat = "health" | "energy" | "money" | "people" | "skills" | "freedom";
export type LifeLook = "man" | "woman" | "other";
type Text = { ru: string; en: string };
/** icon = a lucide-react icon name, drawn by components/LifeChoices.tsx in one flat style. */
export type LifeOption = { key: string; icon: string; label: Text; result: Text; effects: Partial<Record<LifeStat, number>>; interest?: 0 | 1 | 2 };
export type LifeFocus = LifeOption & { guess: Text; wish: Text };
export type LifeSphere = { key: string; icon: string; color: string; title: Text; question: Text; entry: LifeOption[]; focusQuestion: Text; focus: LifeFocus[] };
export type LifeObstacle = { key: string; icon: string; label: Text };

export const LIFE_STATS: readonly LifeStat[] = ["health", "energy", "money", "people", "skills", "freedom"];
export const LIFE_START = 5;

const t = (ru: string, en: string): Text => ({ ru, en });
const e = (key: string, icon: string, label: Text, result: Text, effects: LifeOption["effects"], interest: 0 | 1 | 2): LifeOption => ({ key, icon, label, result, effects, interest });
const f = (key: string, icon: string, label: Text, result: Text, effects: LifeOption["effects"], guess: Text, wish: Text): LifeFocus => ({ key, icon, label, result, effects, guess, wish });

export const LIFE_SPHERES: LifeSphere[] = [
  {
    key: "health", icon: "HeartPulse", color: "#3ccf7a", title: t("Здоровье", "Health"),
    question: t("Как ты себя чувствуешь к вечеру?", "How do you feel by the evening?"),
    entry: [
      e("tired", "BatteryLow", t("Устаю, сил ноль", "Tired, zero energy"), t("Через 10 лет усталость станет нормой, а болезни придут раньше", "In 10 years tiredness is normal and illness comes early"), { energy: -2, health: -1 }, 2),
      e("better", "Sparkles", t("Хочу выглядеть и чувствовать себя лучше", "I want to look and feel better"), t("Тело заметно меняется за 3 месяца привычек", "The body visibly changes in 3 months of habits"), {}, 2),
      e("extra", "Scale", t("Нормально, но есть лишнее", "Fine, but a few extra kilos"), t("+1 кг в год незаметно превращается в +10", "+1 kg a year quietly becomes +10"), { health: -1 }, 1),
      e("great", "ThumbsUp", t("Всё отлично", "All great"), t("Береги это: здоровье легче держать, чем вернуть", "Keep it: health is easier to keep than to win back"), { health: 1 }, 0)
    ],
    focusQuestion: t("Что изменило бы больше всего?", "What would change the most?"),
    focus: [
      f("sport", "Dumbbell", t("Регулярный спорт", "Regular sport"), t("Подтянутое тело, сила и уверенность", "A fit body, strength and confidence"), { health: 2, energy: 1 },
        t("хочешь регулярно заниматься спортом для здоровья, самочувствия и привлекательности, но пока не было инструмента, чтобы создать привычку", "want regular sport for health, energy and looks, but had no tool to build the habit yet"),
        t("Регулярный спорт", "Regular sport")),
      f("food", "Salad", t("Вкусно, полезно и в меру", "Tasty, healthy, in measure"), t("Лёгкость и ясная кожа без мучений", "Lightness and clear skin without suffering"), { health: 2 },
        t("хочешь питаться вкусно и полезно, без срывов и запретов, но пока не было простого плана на каждый день", "want to eat tasty and healthy without bans, but had no simple daily plan"),
        t("Питание без срывов", "Eating well without relapses")),
      f("sleep", "Moon", t("Сон вместо ленты", "Sleep instead of the feed"), t("Утро с ясной головой вместо ленты до двух ночи", "Clear mornings instead of scrolling till 2 am"), { energy: 2 },
        t("хочешь высыпаться и меньше сидеть в телефоне, но вечером рука сама тянется к ленте", "want to sleep well and scroll less, but at night your hand reaches for the feed"),
        t("Высыпаться и меньше телефона", "Sleep well, less phone")),
      f("habits", "CigaretteOff", t("Бросить курение или алкоголь", "Quit smoking or drinking"), t("Свежее лицо и ~$2 000 в год остаются у тебя", "A fresh face and ~$2,000 a year stay with you"), { health: 3, money: 1 },
        t("хочешь избавиться от вредной привычки, но одному сложно продержаться", "want to drop a bad habit, but it's hard to hold on alone"),
        t("Избавиться от вредной привычки", "Drop a bad habit"))
    ]
  },
  {
    key: "relations", icon: "Heart", color: "#e0567a", title: t("Отношения", "Relationships"),
    question: t("Кто рядом с тобой в трудный вечер?", "Who is with you on a hard evening?"),
    entry: [
      e("nobody", "UserX", t("Никого, справляюсь сам", "No one, I manage alone"), t("Одиночество вредит здоровью как пачка сигарет в день", "Loneliness harms health like a pack a day"), { people: -2, health: -1 }, 2),
      e("rarely", "Users", t("Есть люди, но редко видимся", "There are people, we rarely meet"), t("Дружба тихо гаснет без встреч", "Friendship quietly fades without meetings"), { people: -1 }, 2),
      e("partner", "HeartHandshake", t("Хочу пару или семью", "I want a partner or family"), t("Самая частая мечта, которую откладывают «на потом»", "The most common dream put off \"for later\""), {}, 2),
      e("good", "ThumbsUp", t("Всё хорошо", "All good"), t("Свои люди рядом, это редкое богатство", "Your people nearby, a rare wealth"), { people: 1 }, 0)
    ],
    focusQuestion: t("Чего хочется больше?", "What do you want more?"),
    focus: [
      f("partner", "Heart", t("Встретить близкого человека", "Meet someone close"), t("Есть с кем делить и радость, и трудности", "Someone to share joy and trouble with"), { people: 3 },
        t("хочешь встретить близкого человека, но негде знакомиться с теми, кто по духу", "want to meet someone close, but there's nowhere to meet like-minded people"),
        t("Встретить близкого человека", "Meet someone close")),
      f("friends", "Users", t("Свой круг друзей", "My circle of friends"), t("Есть кому позвонить в три часа ночи", "Someone to call at 3 am"), { people: 3, energy: 1 },
        t("хочешь свой круг людей рядом, но во взрослом возрасте трудно заводить друзей", "want your circle nearby, but making friends as an adult is hard"),
        t("Свой круг людей рядом", "My circle of people nearby")),
      f("family", "Home", t("Больше времени с близкими", "More time with family"), t("Дети и родители помнят время, а не подарки", "Kids and parents remember time, not gifts"), { people: 2 },
        t("хочешь больше времени с семьёй, но работа и дела съедают вечера", "want more time with family, but work eats your evenings"),
        t("Больше времени с семьёй", "More time with family"))
    ]
  },
  {
    key: "money", icon: "Wallet", color: "#f2c14e", title: t("Финансы", "Money"),
    question: t("Если завтра пропадёт доход, на сколько хватит денег?", "If your income stopped tomorrow, how long would money last?"),
    entry: [
      e("week", "AlertTriangle", t("На неделю", "A week"), t("Любая поломка становится кризисом", "Any breakdown becomes a crisis"), { money: -2 }, 2),
      e("months", "Clock", t("На месяц-два", "A month or two"), t("Хватит, чтобы не паниковать, но не чтобы выбирать", "Enough not to panic, not enough to choose"), {}, 1),
      e("debt", "CreditCard", t("Есть долги и кредиты", "I have debts and loans"), t("Ты работаешь на банк, а не на себя", "You work for the bank, not for yourself"), { money: -3, freedom: -1 }, 2),
      e("half", "PiggyBank", t("На полгода и больше", "Half a year or more"), t("Спокойный сон и право сказать «нет»", "Calm sleep and the right to say no"), { money: 2, freedom: 1 }, 0)
    ],
    focusQuestion: t("Что сейчас важнее?", "What matters more now?"),
    focus: [
      f("cushion", "PiggyBank", t("Подушка безопасности", "A safety cushion"), t("Через год 3 месяца спокойствия в запасе", "In a year, 3 months of calm in reserve"), { money: 2 },
        t("хочешь подушку на несколько месяцев, но деньги уходят быстрее, чем копятся", "want a cushion for a few months, but money leaves faster than it builds up"),
        t("Подушка на 3 месяца", "A 3-month cushion")),
      f("debt", "CreditCard", t("Выбраться из долгов", "Get out of debt"), t("Каждый закрытый кредит прибавляет к зарплате", "Each closed loan adds to your pay"), { money: 2, freedom: 2 },
        t("хочешь закрыть долги и больше не брать, но пока не было понятного плана", "want to close your debts and stop borrowing, but had no clear plan"),
        t("Закрыть долги", "Close my debts")),
      f("income", "TrendingUp", t("Второй доход", "A second income"), t("Второй доход превращает страх в выбор", "A second income turns fear into choice"), { money: 2, skills: 1 },
        t("хочешь второй источник дохода, но не знаешь, с чего начать", "want a second income, but don't know where to start"),
        t("Второй источник дохода", "A second income")),
      f("invest", "LineChart", t("Капитал, который работает", "Capital that works"), t("К сорока свой капитал и спокойный сон", "Own capital and calm sleep by forty"), { money: 3 },
        t("хочешь, чтобы деньги работали на тебя, но страшно и непонятно, куда вкладывать", "want money to work for you, but investing feels scary and unclear"),
        t("Свой капитал", "My own capital"))
    ]
  },
  {
    key: "career", icon: "Briefcase", color: "#4f9be0", title: t("Карьера", "Career"),
    question: t("Как тебе твоя работа?", "How is your work?"),
    entry: [
      e("burnout", "Flame", t("Выгораю, хочу уйти", "Burning out, want to leave"), t("Ещё 5 лет так, и сил не останется ни на что", "Five more years like this and nothing is left"), { energy: -2 }, 2),
      e("ceiling", "ArrowUpToLine", t("Нормально, но потолок", "Fine, but a ceiling"), t("Через 5 лет то же место и та же зарплата", "In 5 years the same desk and the same pay"), { freedom: -1 }, 2),
      e("search", "Search", t("Ищу работу", "Looking for work"), t("Каждый месяц без работы бьёт по уверенности", "Every month without work hits confidence"), { money: -1 }, 2),
      e("love", "Smile", t("Нравится", "I like it"), t("Работа, которая радует, это половина счастья", "Work that brings joy is half of happiness"), { skills: 1, energy: 1 }, 0)
    ],
    focusQuestion: t("Куда хочется расти?", "Where do you want to grow?"),
    focus: [
      f("raise", "TrendingUp", t("Рост и повышение", "Growth and promotion"), t("Через 2 года другая должность и доход", "In 2 years a new role and income"), { money: 2, skills: 1 },
        t("хочешь вырасти в доходе и должности, но не понимаешь, какой шаг даст рост", "want to grow in pay and role, but don't see which step gives growth"),
        t("Рост в доходе и должности", "Grow in pay and role")),
      f("switch", "Shuffle", t("Сменить профессию", "Change profession"), t("Утро, когда хочется на работу", "Mornings when you want to go to work"), { energy: 2, skills: 2 },
        t("хочешь сменить профессию на более интересную, но страшно начинать с нуля", "want a more interesting profession, but starting from zero is scary"),
        t("Новая профессия", "A new profession")),
      f("remote", "Laptop", t("Удалёнка и свой график", "Remote work, own schedule"), t("Работаешь из любой точки мира", "Working from anywhere in the world"), { freedom: 3 },
        t("хочешь работать удалённо и по своему графику, но пока нет навыка или заказчиков", "want remote work on your own schedule, but lack the skill or clients so far"),
        t("Удалённая работа по своему графику", "Remote work on my own schedule"))
    ]
  },
  {
    key: "learning", icon: "GraduationCap", color: "#8a5bd6", title: t("Образование", "Learning"),
    question: t("Когда ты последний раз учил что-то новое?", "When did you last learn something new?"),
    entry: [
      e("long", "Hourglass", t("Давно, всё устаревает", "Long ago, it's all getting old"), t("ИИ меняет профессии быстрее, чем кажется", "AI changes jobs faster than it seems"), { skills: -2 }, 2),
      e("notime", "Clock", t("Хочу, но нет времени", "I want to, no time"), t("15 минут в день это 90 часов в год", "15 minutes a day is 90 hours a year"), {}, 2),
      e("always", "BookOpen", t("Учусь постоянно", "I learn all the time"), t("Через 3 года тебя зовут, а не ты просишься", "In 3 years they call you, not the other way"), { skills: 2 }, 1),
      e("no", "X", t("Мне это не нужно", "I don't need it"), t("Профессию заменяет ИИ, доход падает", "AI replaces the job, income falls"), { skills: -1 }, 0)
    ],
    focusQuestion: t("Что выучить первым?", "What to learn first?"),
    focus: [
      f("ai", "Bot", t("Работать с ИИ", "Working with AI"), t("ИИ делает за тебя часы рутины", "AI does hours of routine for you"), { skills: 3, freedom: 1 },
        t("хочешь освоить ИИ, чтобы он работал на тебя, но не знаешь, с чего начать", "want to master AI so it works for you, but don't know where to start"),
        t("Освоить ИИ", "Master AI")),
      f("language", "Languages", t("Иностранный язык", "A foreign language"), t("Мир и работа без границ", "A world and work without borders"), { skills: 2, freedom: 1 },
        t("хочешь заговорить на другом языке, но каждый раз бросаешь через пару недель", "want to speak another language, but quit after a couple of weeks every time"),
        t("Заговорить на новом языке", "Speak a new language")),
      f("skill", "Wrench", t("Навык, за который платят", "A skill people pay for"), t("Навык, который кормит в любой стране", "A skill that feeds you in any country"), { skills: 2, money: 1 },
        t("хочешь освоить навык, за который платят, но курсы дорогие и непонятно, какой выбрать", "want a skill people pay for, but courses are expensive and it's unclear which"),
        t("Навык, за который платят", "A skill people pay for"))
    ]
  },
  {
    key: "business", icon: "Rocket", color: "#e07a3c", title: t("Своё дело", "Own business"),
    question: t("Думал о своём деле?", "Have you thought about your own business?"),
    entry: [
      e("idea", "Lightbulb", t("Да, есть идея", "Yes, I have an idea"), t("Идея без первого шага через год остаётся идеей", "An idea without a first step is still an idea in a year"), {}, 2),
      e("have", "Store", t("Дело есть, хочу роста", "I have one, want growth"), t("Без новых клиентов дело стоит на месте", "Without new clients a business stands still"), { freedom: 1 }, 2),
      e("scared", "ShieldAlert", t("Хочу, но страшно", "I want to, but I'm scared"), t("Страх стоит дороже ошибки", "Fear costs more than a mistake"), { freedom: -1 }, 2),
      e("notmine", "X", t("Не моё", "Not for me"), t("Тоже честный выбор", "Also an honest choice"), {}, 0)
    ],
    focusQuestion: t("Какой шаг ближе?", "Which step is closer?"),
    focus: [
      f("client", "Handshake", t("Первый клиент", "The first client"), t("Первые деньги от своего дела меняют всё", "The first money from your own thing changes everything"), { freedom: 2, money: 1 },
        t("хочешь получить первого клиента своего дела, но не знаешь, где его найти", "want the first client of your business, but don't know where to find one"),
        t("Первый клиент своего дела", "The first client of my business")),
      f("grow", "BarChart3", t("Больше клиентов", "More clients"), t("Стабильные продажи и спокойствие", "Steady sales and calm"), { money: 2, freedom: 1 },
        t("хочешь больше клиентов и стабильные продажи, но реклама дорогая", "want more clients and steady sales, but ads are expensive"),
        t("Стабильные продажи", "Steady sales")),
      f("side", "Moon", t("Своё по вечерам", "My own thing in the evenings"), t("Медленно, но надёжно растёт своё", "Your own thing grows slowly but surely"), { freedom: 1, skills: 1 },
        t("хочешь своё дело без ухода с работы, но не хватает времени и плана", "want your own business without quitting, but lack time and a plan"),
        t("Своё дело рядом с работой", "My own business next to my job"))
    ]
  },
  {
    key: "experience", icon: "Plane", color: "#3cbfcf", title: t("Впечатления", "Experiences"),
    question: t("Когда ты последний раз делал что-то впервые?", "When did you last do something for the first time?"),
    entry: [
      e("forgot", "CalendarX", t("Не помню", "Can't remember"), t("Годы без нового сливаются в один", "Years without anything new merge into one"), { energy: -1 }, 2),
      e("dream", "Plane", t("Мечтаю о путешествии", "I dream of a trip"), t("Мечта без даты так и остаётся мечтой", "A dream without a date stays a dream"), {}, 2),
      e("hobby", "Palette", t("Хочу своё хобби", "I want a hobby"), t("Занятие для души возвращает силы", "Something for the soul brings energy back"), {}, 2),
      e("recent", "Sparkles", t("Недавно, всё хорошо", "Recently, all good"), t("Жизнь, которую интересно вспоминать", "A life worth remembering"), { energy: 1 }, 0)
    ],
    focusQuestion: t("Чего хочется больше?", "What do you want more?"),
    focus: [
      f("travel", "Plane", t("Путешествие мечты", "The trip of a dream"), t("Воспоминания, которые остаются на всю жизнь", "Memories that stay for life"), { energy: 2, freedom: 1 },
        t("хочешь путешествие, о котором давно мечтаешь, но всё время находится причина отложить", "want the trip you've dreamed of, but there's always a reason to postpone"),
        t("Путешествие мечты", "The trip of my dreams")),
      f("hobby", "Palette", t("Занятие для души", "Something for the soul"), t("Вечера, которых ждёшь", "Evenings you look forward to"), { energy: 2 },
        t("хочешь занятие для души, но после работы нет сил начать", "want something for the soul, but after work there's no energy to start"),
        t("Своё хобби", "My own hobby")),
      f("events", "Music", t("Концерты и события", "Concerts and events"), t("Живые эмоции и новые люди", "Live emotions and new people"), { energy: 1, people: 1 },
        t("хочешь больше живых событий, но не с кем и некогда", "want more live events, but there's no one to go with and no time"),
        t("Больше живых событий", "More live events"))
    ]
  },
  {
    key: "purchases", icon: "ShoppingBag", color: "#c95fb0", title: t("Покупки", "Purchases"),
    question: t("Есть вещь, которую давно хочешь, но откладываешь?", "Is there something you've long wanted but keep putting off?"),
    entry: [
      e("big", "Home", t("Да, жильё или машина", "Yes, a home or a car"), t("Без плана такая покупка отодвигается на 10 лет", "Without a plan it moves 10 years away"), {}, 2),
      e("thing", "Package", t("Да, для дела или себя", "Yes, for work or myself"), t("Нужная вещь экономит часы каждую неделю", "The right thing saves hours every week"), {}, 2),
      e("small", "Coins", t("На мелочи хватает, на важное нет", "Enough for small things, not for big"), t("Мелкие траты съедают крупные мечты", "Small spending eats big dreams"), { money: -1 }, 2),
      e("all", "Check", t("Всё есть", "I have everything"), t("Свобода от «хочу ещё»", "Freedom from \"I want more\""), { freedom: 1 }, 0)
    ],
    focusQuestion: t("Что именно?", "What exactly?"),
    focus: [
      f("home", "Home", t("Своё жильё", "My own home"), t("Свои стены и никаких хозяев", "Your own walls, no landlord"), { freedom: 2, money: 1 },
        t("хочешь своё жильё, но сумма кажется недостижимой", "want your own home, but the sum feels out of reach"),
        t("Своё жильё", "My own home")),
      f("car", "Car", t("Машина", "A car"), t("Свобода ехать куда хочешь", "Freedom to go anywhere"), { freedom: 1 },
        t("хочешь машину без кабального кредита, но не получается накопить", "want a car without a crushing loan, but can't save up"),
        t("Машина без кредита", "A car without a loan")),
      f("gift", "Gift", t("Вещь для дела или себя", "A thing for work or me"), t("Маленькая мечта, которая сбылась, зовёт следующую", "One small dream come true calls the next"), { energy: 1 },
        t("хочешь купить важную вещь, но деньги всё время уходят на другое", "want to buy an important thing, but money keeps going elsewhere"),
        t("Важная покупка", "An important purchase"))
    ]
  }
];

/** "Not quite": what really stops, one tap. "less" means the sphere matters less than it looked. */
export const LIFE_OBSTACLES: LifeObstacle[] = [
  { key: "time", icon: "Clock", label: t("Нет времени", "No time") },
  { key: "start", icon: "HelpCircle", label: t("Не знаю, с чего начать", "Don't know where to start") },
  { key: "money", icon: "Coins", label: t("Нет денег", "No money") },
  { key: "alone", icon: "UserX", label: t("Не с кем, одному тяжело", "No one to do it with") },
  { key: "less", icon: "Minus", label: t("Это не так важно", "It's not that important") }
];

export type SphereAnswer = { entry?: string; focus?: string; verdict?: "yes" | "no"; obstacle?: string };
export type LifeAnswers = Record<string, SphereAnswer>;
export type LifeStats = Record<LifeStat, number>;
export type LifeLevel = "entry" | "focus" | "guess" | "why";
export type LifeCursor = { sphere: number; level: LifeLevel } | null;

function entryOption(sphere: LifeSphere, answer?: SphereAnswer) {
  return sphere.entry.find((item) => item.key === answer?.entry);
}

function focusOption(sphere: LifeSphere, answer?: SphereAnswer) {
  return sphere.focus.find((item) => item.key === answer?.focus);
}

/** Where the person is: the first sphere/level without an answer, or null when every sphere is done. */
export function lifeCursor(answers: LifeAnswers): LifeCursor {
  for (let index = 0; index < LIFE_SPHERES.length; index += 1) {
    const sphere = LIFE_SPHERES[index];
    const answer = answers[sphere.key] ?? {};
    if (!answer.entry) return { sphere: index, level: "entry" };
    if ((entryOption(sphere, answer)?.interest ?? 0) === 0) continue;
    if (!answer.focus) return { sphere: index, level: "focus" };
    if (!answer.verdict) return { sphere: index, level: "guess" };
    if (answer.verdict === "no" && !answer.obstacle) return { sphere: index, level: "why" };
  }
  return null;
}

export function lifeStats(answers: LifeAnswers): LifeStats {
  const stats = Object.fromEntries(LIFE_STATS.map((stat) => [stat, LIFE_START])) as LifeStats;
  for (const sphere of LIFE_SPHERES) {
    const answer = answers[sphere.key];
    for (const option of [entryOption(sphere, answer), focusOption(sphere, answer)]) {
      if (!option) continue;
      for (const [stat, delta] of Object.entries(option.effects) as Array<[LifeStat, number]>) {
        stats[stat] = Math.max(0, Math.min(10, stats[stat] + delta));
      }
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
    free: stats.freedom >= 7,
    // A sad face only when most of life is weak, not for one weak spot.
    sad: LIFE_STATS.filter((stat) => stats[stat] < LIFE_START).length >= 3
  };
}

const pick = (text: Text, locale: string) => (locale === "ru" ? text.ru : text.en);

export function lifeText(text: Text, locale: string): string {
  return pick(text, locale);
}

const STAT_NAME: Record<LifeStat, Text> = {
  health: t("Здоровье", "Health"),
  energy: t("Силы", "Energy"),
  money: t("Деньги", "Money"),
  people: t("Люди", "People"),
  skills: t("Навыки", "Skills"),
  freedom: t("Свобода", "Freedom")
};

export function statName(stat: LifeStat, locale: string): string {
  return pick(STAT_NAME[stat], locale);
}

/** Nova's guess for a sphere: "Can we say you want ..., but ...?" */
export function lifeGuess(sphereKey: string, focusKey: string, locale: string): string {
  const focus = LIFE_SPHERES.find((item) => item.key === sphereKey)?.focus.find((item) => item.key === focusKey);
  if (!focus) return "";
  return locale === "ru" ? `Можно ли сказать, что ты ${focus.guess.ru}?` : `Can we say you ${focus.guess.en}?`;
}

export type LifeWish = { sphere: string; focus: string; title: string; weight: number; obstacle?: string };

/** The wishes found: confirmed guesses first ("yes" = 3, "not quite" with a real reason = 2, entry interest adds). */
export function lifeWishes(answers: LifeAnswers, locale: string): LifeWish[] {
  const wishes: LifeWish[] = [];
  for (const sphere of LIFE_SPHERES) {
    const answer = answers[sphere.key];
    const focus = focusOption(sphere, answer);
    if (!focus || !answer?.verdict || answer.obstacle === "less") continue;
    const weight = (answer.verdict === "yes" ? 3 : 2) + (entryOption(sphere, answer)?.interest ?? 0);
    wishes.push({ sphere: sphere.key, focus: focus.key, title: pick(focus.wish, locale), weight, obstacle: answer.obstacle });
  }
  return wishes.sort((a, b) => b.weight - a.weight);
}

export function lifeWeakest(stats: LifeStats): LifeStat {
  return [...LIFE_STATS].sort((a, b) => stats[a] - stats[b])[0];
}

/** The growth-path motives saved for the first quest (lib/questPath.ts QUEST_MOTIVES), with the main wish as the note. */
export function lifeQuestMotives(sphereKey: string): Array<"income" | "learn" | "change" | "own"> {
  if (sphereKey === "money" || sphereKey === "career" || sphereKey === "business") return ["income", "own"];
  if (sphereKey === "learning") return ["learn", "own"];
  return ["change", "own"];
}

export const LIFE_UI: Record<string, Text> = {
  lookTitle: t("Кто ты в этой игре?", "Who are you in this game?"),
  man: t("Мужчина", "Man"),
  woman: t("Женщина", "Woman"),
  other: t("Другое", "Other"),
  intro: t("Посмотри, как выбор меняет жизнь", "See how choices change a life"),
  step: t("{n} из {total}", "{n} of {total}"),
  next: t("Дальше", "Next"),
  yes: t("Да, это про меня", "Yes, that's me"),
  notQuite: t("Не совсем", "Not quite"),
  why: t("Что на самом деле мешает?", "What really stops you?"),
  nova: t("Нова", "Nova"),
  finalTitle: t("Ты через 10 лет", "You in 10 years"),
  important: t("Что для тебя важно", "What matters to you"),
  pickMain: t("Выбери главное сейчас", "Pick the main one for now"),
  start: t("Начать с этого", "Start with this"),
  noWishes: t("Похоже, у тебя всё хорошо. Начнём с того, чтобы так и оставалось", "Looks like all is well. Let's keep it that way"),
  weakest: t("Слабое место: {stat}", "Weak spot: {stat}"),
  replay: t("Пройти иначе", "Play again"),
  close: t("Закрыть, продолжить позже", "Close, continue later"),
  continue: t("Продолжить приключение", "Continue the adventure"),
  yourMain: t("Твоё главное сейчас", "Your main goal now")
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

export const LIFE_STORAGE = { flag: FLAG_KEY, result: "oa.lifeChoices", progress: "oa.lifeChoicesProgress2", done: "oa.lifeChoicesDone", closed: "oa.lifeChoicesClosed" } as const;
