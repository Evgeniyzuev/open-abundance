// «Про изобилие» (founder decision 2026-10-29): five questions on how money works here, each with one right answer
// and a one-card lesson after a wrong one, then a reel window where coins drop for every answer right on the first
// try, then five questions on what people think about AI and the future (any answer is right; the future one shows a
// piece of lore). Reward: the task's Core reward × share of first-try right answers, graded on the server from this
// key. Facts follow lib/ai/knowledge.ts «Core, Wallet and Treasury». Pure, no imports: used by client and server.

export const ABUNDANCE_QUIZ_LOGIC = "abundance_quiz";
export const ABUNDANCE_QUIZ_PROOF = "abundance_quiz_done";

type Text = { ru: string; en: string };
export type QuizOption = { id: string; text: Text };
export type KnowledgeQuestion = { id: string; art: string; question: Text; options: QuizOption[]; correct: string; lesson: Text };
export type OpinionQuestion = { id: string; art: string; question: Text; options: QuizOption[]; lore?: Record<string, Text> };

const o = (id: string, ru: string, en: string): QuizOption => ({ id, text: { ru, en } });

export const KNOWLEDGE_QUESTIONS: KnowledgeQuestion[] = [
  {
    id: "withdraw_what",
    art: "💸",
    question: { ru: "Что можно вывести на свой криптокошелёк?", en: "What can you withdraw to your own crypto wallet?" },
    options: [o("core", "Core", "Core"), o("wallet", "Wallet", "Wallet"), o("both", "И Core, и Wallet", "Both Core and Wallet"), o("none", "Ничего", "Nothing")],
    correct: "wallet",
    lesson: {
      ru: "Выводится Wallet: Wallet → «Вывести», в TON или USDT. Core — твой капитал внутри Open Abundance: его нельзя вывести или потерять, он остаётся с тобой и приносит доход каждый день.",
      en: "Wallet is what you withdraw: Wallet → Withdraw, in TON or USDT. Core is your capital inside Open Abundance: it can't be withdrawn or lost, it stays with you and brings income every day."
    }
  },
  {
    id: "core_income",
    art: "🌱",
    question: { ru: "Откуда берётся доход Core?", en: "Where does Core income come from?" },
    options: [
      o("daily", "Каждый день начисляется процент от Core", "A percentage of Core accrues every day"),
      o("friends", "Только когда приглашаешь друзей", "Only when you invite friends"),
      o("ads", "За просмотр рекламы", "From watching ads"),
      o("once", "Один раз при регистрации", "Once, at sign-up")
    ],
    correct: "daily",
    lesson: {
      ru: "Каждый день к Core начисляется 0,0633% от него. Сколько из этого вернётся в Core, решаешь ты ползунком «Реинвест» в Wallet → Core: то, что не реинвестировано, приходит в Wallet. Это расчёт по текущим правилам, а не гарантия дохода.",
      en: "Every day 0.0633% of your Core accrues. You choose with the Reinvest slider (Wallet → Core) how much goes back into Core: the part not reinvested comes to Wallet. This is a calculation under the current rules, not a guaranteed return."
    }
  },
  {
    id: "wallet_sources",
    art: "👛",
    question: { ru: "Что приносит деньги прямо в Wallet?", en: "What brings money straight to Wallet?" },
    options: [
      o("any_task", "Любое задание", "Any task"),
      o("sources", "«Я не робот», друзья по твоей ссылке, продажи в Маркете, нереинвестированный доход Core", "«I'm not a robot», friends via your link, Market sales, Core income you don't reinvest"),
      o("purchases", "Только покупки", "Only purchases"),
      o("nothing", "Ничего, всё идёт в Core", "Nothing, everything goes to Core")
    ],
    correct: "sources",
    lesson: {
      ru: "Большинство заданий платит в Core. Прямо в Wallet приходят: $1 за «Я не робот», часть бонусов за активных друзей, деньги за продажи в Маркете и та часть дохода Core, которую ты не реинвестируешь.",
      en: "Most tasks pay to Core. Straight to Wallet come: $1 for «I'm not a robot», part of the bonuses for active friends, money from your Market sales, and the part of Core income you don't reinvest."
    }
  },
  {
    id: "to_cash",
    art: "🔁",
    question: { ru: "Как получить выведенное в рублях или другой валюте?", en: "How do you turn a withdrawal into your local currency?" },
    options: [
      o("p2p", "Вывести USDT или TON и обменять через P2P", "Withdraw USDT or TON and exchange it via P2P"),
      o("card", "Приложение само отправит на карту", "The app sends it to a bank card itself"),
      o("never", "Никак", "There is no way"),
      o("bank", "Только через банковский перевод из приложения", "Only by bank transfer from the app")
    ],
    correct: "p2p",
    lesson: {
      ru: "Сначала выведи USDT или TON из Wallet на свой кошелёк, потом обменяй через P2P: в разделе P2P здесь, с другими участниками, или в сторонних сервисах вроде кошелька в Telegram. Начни с небольшой суммы.",
      en: "First withdraw USDT or TON from Wallet to your own wallet, then exchange it via P2P: in the P2P section here with other members, or in third-party services such as the wallet in Telegram. Start with a small amount."
    }
  },
  {
    id: "not_robot",
    art: "🤖",
    question: { ru: "Что даёт «Я не робот»?", en: "What does «I'm not a robot» give you?" },
    options: [
      o("login", "Без него нельзя войти", "You can't sign in without it"),
      o("perks", "$1 в Wallet и $3 в Core, бонусы за друзей в Wallet и вывод без минимума $1", "$1 to Wallet and $3 to Core, friend bonuses to Wallet, and withdrawals without the $1 minimum"),
      o("nothing", "Ничего", "Nothing"),
      o("ads", "Убирает рекламу", "It removes ads")
    ],
    correct: "perks",
    lesson: {
      ru: "«Я не робот» — короткая проверка, что ты живой человек. За неё $1 приходит в Wallet и $3 в Core, бонусы за приглашённых друзей начинают идти в Wallet, а первый вывод можно сделать на любую сумму.",
      en: "«I'm not a robot» is a short check that you are a real person. It gives $1 to Wallet and $3 to Core, bonuses for invited friends start going to Wallet, and your first withdrawal can be any amount."
    }
  }
];

export const OPINION_QUESTIONS: OpinionQuestion[] = [
  {
    id: "ai_noticed",
    art: "👀",
    question: { ru: "Ты уже замечаешь влияние ИИ на экономику и работу?", en: "Do you already notice AI's effect on the economy and jobs?" },
    options: [o("strong", "Да, сильно", "Yes, a lot"), o("some", "Немного", "A little"), o("not_yet", "Пока нет", "Not yet"), o("not_thought", "Не задумывался", "Haven't thought about it")]
  },
  {
    id: "wealth_multiply",
    art: "📈",
    question: { ru: "Могут ли технологии и ИИ за несколько лет увеличить богатство общества в разы?", en: "Can technology and AI multiply society's wealth within a few years?" },
    options: [o("sure", "Да, уверен", "Yes, I'm sure"), o("maybe", "Возможно", "Maybe"), o("doubt", "Сомневаюсь", "I doubt it"), o("no", "Нет", "No")]
  },
  {
    id: "future",
    art: "🔮",
    question: { ru: "К чему это приведёт, как думаешь?", en: "Where do you think it leads?" },
    options: [
      o("prosperity", "Всеобщее процветание", "Prosperity for all"),
      o("utopia", "Утопия", "Utopia"),
      o("cyberpunk", "Киберпанк", "Cyberpunk"),
      o("inequality", "Рост неравенства", "Growing inequality"),
      o("power_war", "Война за власть", "A war for power")
    ],
    lore: {
      prosperity: {
        ru: "Мы тоже в это верим. Но процветание само не приходит: Open Abundance — попытка дойти туда вместе, когда общий Core растёт от вклада каждого, а ИИ помогает исполнять желания.",
        en: "We believe in it too. But prosperity doesn't come by itself: Open Abundance is an attempt to get there together, with the shared Core growing from everyone's contribution and AI helping wishes come true."
      },
      utopia: {
        ru: "Утопия — «место, которого нет». Изобилие можно строить по шагу: желание, задание, результат. Здесь каждое исполненное желание — маленький кусочек этого будущего.",
        en: "Utopia means \"no place\". Abundance can be built step by step: a wish, a task, a result. Here every wish that comes true is a small piece of that future."
      },
      cyberpunk: {
        ru: "Киберпанк — это технологии в руках немногих. Поэтому здесь Core нельзя продать или передать по наследству, а награды за задания одинаковые для всех.",
        en: "Cyberpunk is technology in the hands of a few. That's why here Core can't be sold or inherited, and task rewards are the same for everyone."
      },
      inequality: {
        ru: "Риск настоящий. Ответ Open Abundance: равный доступ к заработку, одинаковые награды независимо от статуса и капитал, который нельзя унаследовать, поэтому он не копится в одних руках.",
        en: "The risk is real. Open Abundance's answer: equal access to earning, the same rewards regardless of status, and capital that can't be inherited, so it doesn't pile up in a few hands."
      },
      power_war: {
        ru: "Сила ИИ должна быть проверяемой. В плане Open Abundance правила меняются открытым голосованием, а ИИ никогда сам не решает про деньги и правила.",
        en: "AI's power has to be verifiable. In Open Abundance's plan the rules change by open vote, and AI never decides on money or rules by itself."
      }
    }
  },
  {
    id: "free_time",
    art: "🌅",
    question: { ru: "Чем бы ты занимался, если бы деньги на жизнь были не нужны?", en: "What would you do if you didn't need money to live?" },
    options: [o("learn", "Учился", "Learn"), o("create", "Творил", "Create"), o("travel", "Путешествовал", "Travel"), o("help", "Помогал людям", "Help people"), o("business", "Своё дело", "My own project"), o("rest", "Отдыхал", "Rest")]
  },
  {
    id: "who_benefits",
    art: "🤝",
    question: { ru: "Кто, по-твоему, получит выгоду от ИИ?", en: "Who do you think will benefit from AI?" },
    options: [o("everyone", "Все люди", "Everyone"), o("few", "Немногие", "A few"), o("united", "Те, кто объединится", "Those who team up"), o("unsure", "Пока не знаю", "Not sure yet")]
  }
];

/** Server-side grade of the first answers to the knowledge questions: how many were right. */
export function gradeKnowledge(firstAnswers: unknown): { correct: number; perQuestion: Record<string, boolean> } {
  const answers = firstAnswers && typeof firstAnswers === "object" ? (firstAnswers as Record<string, unknown>) : {};
  const perQuestion: Record<string, boolean> = {};
  for (const question of KNOWLEDGE_QUESTIONS) perQuestion[question.id] = answers[question.id] === question.correct;
  return { correct: Object.values(perQuestion).filter(Boolean).length, perQuestion };
}

/** Opinion answers limited to the known questions and options. */
export function cleanOpinions(value: unknown): Record<string, string> {
  const answers = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const clean: Record<string, string> = {};
  for (const question of OPINION_QUESTIONS) {
    const answer = answers[question.id];
    if (typeof answer === "string" && question.options.some((option) => option.id === answer)) clean[question.id] = answer;
  }
  return clean;
}

export function quizReward(coreRewardAmount: number, correct: number): number {
  return Math.round((Number(coreRewardAmount) * correct) / KNOWLEDGE_QUESTIONS.length * 100) / 100;
}
