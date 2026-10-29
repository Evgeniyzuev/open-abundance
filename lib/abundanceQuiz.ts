// «Про изобилие» (founder decision 2026-10-29): five questions on how money works here, each with one right answer
// and a one-card lesson after a wrong one, then a reel window where coins drop for every answer right on the first
// try, then five questions on what people think about AI and the future (any answer is right; the future one shows a
// piece of lore). Reward: the task's Core reward × share of first-try right answers, graded on the server from this
// key. Facts follow lib/ai/knowledge.ts «Core, Wallet and Treasury»; Evgen (2026-10-29): inspire and show what people want, no technical detail (currencies, rates) at this point. Pure, no imports: used by client and server.

export const ABUNDANCE_QUIZ_LOGIC = "abundance_quiz";
export const ABUNDANCE_QUIZ_PROOF = "abundance_quiz_done";

type Text = { ru: string; en: string };
export type QuizOption = { id: string; text: Text };
export type KnowledgeQuestion = { id: string; art: string; question: Text; options: QuizOption[]; correct: string; lesson: Text };
export type OpinionQuestion = { id: string; art: string; question: Text; options: QuizOption[]; lore?: Record<string, Text> };

const o = (id: string, ru: string, en: string): QuizOption => ({ id, text: { ru, en } });

export const KNOWLEDGE_QUESTIONS: KnowledgeQuestion[] = [
  {
    id: "can_withdraw",
    art: "💸",
    question: { ru: "Можно ли вывести то, что заработал?", en: "Can you withdraw what you earn?" },
    options: [
      o("yes", "Да, из Wallet на свой кошелёк", "Yes, from Wallet to your own wallet"),
      o("never", "Нет, всё остаётся в приложении", "No, it all stays in the app"),
      o("year", "Только через год", "Only after a year"),
      o("friends", "Только за приглашения", "Only for invites")
    ],
    correct: "yes",
    lesson: {
      ru: "Да! Всё, что в Wallet, можно вывести. А Core — твой растущий капитал: он всегда с тобой и каждый день приносит доход.",
      en: "Yes! Everything in Wallet can be withdrawn. And Core is your growing capital: it always stays with you and brings income every day."
    }
  },
  {
    id: "core_grows",
    art: "🌱",
    question: { ru: "Что делает Core?", en: "What does Core do?" },
    options: [
      o("grows", "Растёт и каждый день приносит доход", "Grows and brings income every day"),
      o("points", "Это просто очки", "It's just points"),
      o("burns", "Сгорает, если не заходить", "Burns if you don't log in"),
      o("spend", "Тратится на покупки", "Gets spent on purchases")
    ],
    correct: "grows",
    lesson: {
      ru: "Core никогда не уменьшается и каждый день приносит доход. Чем он больше, тем выше уровень и тем быстрее растёт сам.",
      en: "Core never goes down and brings income every day. The bigger it is, the higher your level and the faster it grows by itself."
    }
  },
  {
    id: "level_up",
    art: "🚀",
    question: { ru: "Что открывается с ростом уровня?", en: "What opens up as your level grows?" },
    options: [
      o("more", "Новые задания и награды побольше, в том числе прямо в Wallet", "New tasks and bigger rewards, including straight to Wallet"),
      o("nothing", "Ничего", "Nothing"),
      o("avatars", "Только новые аватарки", "Only new avatars"),
      o("ads", "Больше рекламы", "More ads")
    ],
    correct: "more",
    lesson: {
      ru: "Чем выше уровень, тем больше возможностей: новые задания, награды побольше и всё больше наград прямо в Wallet.",
      en: "The higher your level, the more opens up: new tasks, bigger rewards and more and more rewards straight to Wallet."
    }
  },
  {
    id: "grow_faster",
    art: "🤝",
    question: { ru: "Как расти быстрее?", en: "How do you grow faster?" },
    options: [
      o("tasks_friends", "Делать задания и звать друзей", "Do tasks and invite friends"),
      o("wait", "Просто ждать", "Just wait"),
      o("scroll", "Листать ленту", "Scroll the feed"),
      o("no_way", "Никак", "There's no way")
    ],
    correct: "tasks_friends",
    lesson: {
      ru: "Каждое задание добавляет Core, а за друзей, которые пришли по твоей ссылке, тоже приходят награды. Вместе расти веселее и быстрее.",
      en: "Every task adds Core, and friends who join through your link bring rewards too. Growing together is faster and more fun."
    }
  },
  {
    id: "wishes",
    art: "✨",
    question: { ru: "Для чего всё это?", en: "What is it all for?" },
    options: [
      o("wishes", "Чтобы исполнять желания — свои и других людей", "To make wishes come true, yours and other people's"),
      o("score", "Чтобы набрать очки", "To score points"),
      o("time", "Чтобы проводить время в приложении", "To spend time in the app"),
      o("ads", "Чтобы смотреть рекламу", "To watch ads")
    ],
    correct: "wishes",
    lesson: {
      ru: "Главное здесь — желания. Core и награды — это путь к ним, а ИИ и люди вокруг помогают дойти быстрее.",
      en: "Wishes are what matters here. Core and rewards are the way to them, and AI and the people around you help you get there faster."
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
