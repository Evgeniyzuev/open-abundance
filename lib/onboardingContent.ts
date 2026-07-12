import type { AppLocale } from "@/lib/i18n";

type LocalizedText = Record<AppLocale, string>;

type ShowcaseCard = {
  name: LocalizedText;
  level: number;
  stats: Record<AppLocale, string[]>;
  quote?: LocalizedText;
};

type OnboardingContent = {
  intro: {
    badge: LocalizedText;
    title: LocalizedText;
    body: LocalizedText;
  };
  showcaseCards: ShowcaseCard[];
  explanationPoints: Array<{
    title: LocalizedText;
    body: LocalizedText;
  }>;
  questions: {
    time: {
      title: LocalizedText;
      options: Array<{
        id: "short" | "medium" | "deep";
        label: LocalizedText;
        range: [number, number];
      }>;
    };
    goal: {
      title: LocalizedText;
      placeholder: LocalizedText;
    };
    referrals: {
      title: LocalizedText;
      placeholder: LocalizedText;
    };
  };
  potentialRules: {
    referralCoreRange: [number, number];
    levelHint: LocalizedText;
    disclaimer: LocalizedText;
  };
  actions: {
    viewFeed: LocalizedText;
    viewExamples: LocalizedText;
    continue: LocalizedText;
    estimate: LocalizedText;
    createAccount: LocalizedText;
    browseMore: LocalizedText;
    back: LocalizedText;
  };
};

export const ONBOARDING_SEEN_STORAGE_KEY = "openAbundanceOnboardingSeen";

export const onboardingContent: OnboardingContent = {
  intro: {
    badge: {
      ru: "Open Abundance",
      en: "Open Abundance"
    },
    title: {
      ru: "Ты попал. Просто посмотри.",
      en: "You made it. Just look around."
    },
    body: {
      ru: "Люди здесь зарабатывают, растут и достигают целей в системе, где прогресс виден и может быть вознагражден.",
      en: "People here earn, grow, and move toward goals in a system where progress is visible and can be rewarded."
    }
  },
  showcaseCards: [
    {
      name: { ru: "Анна", en: "Anna" },
      level: 5,
      stats: {
        ru: ["Заработала $240 за месяц", "Цель: новый MacBook — собрано 73%"],
        en: ["Earned $240 this month", "Goal: new MacBook — 73% funded"]
      }
    },
    {
      name: { ru: "Дмитрий", en: "Dmitry" },
      level: 3,
      stats: {
        ru: ["Привел 4 рефералов", "Активен 12 дней подряд"],
        en: ["Invited 4 referrals", "Active 12 days in a row"]
      }
    },
    {
      name: { ru: "Катя", en: "Kate" },
      level: 8,
      stats: {
        ru: ["Core: $1,240", "Выполнила 52 задания"],
        en: ["Core: $1,240", "Completed 52 challenges"]
      },
      quote: {
        ru: "Первый месяц вообще не верила, что работает.",
        en: "I did not believe it could work during the first month."
      }
    },
    {
      name: { ru: "Илья", en: "Ilya" },
      level: 4,
      stats: {
        ru: ["Daily rate: $3.80", "Команда: 7 участников"],
        en: ["Daily rate: $3.80", "Team: 7 members"]
      }
    }
  ],
  explanationPoints: [
    {
      title: { ru: "Делаешь задания", en: "Complete challenges" },
      body: { ru: "Реальные полезные действия превращаются в Core.", en: "Useful real actions turn into Core." }
    },
    {
      title: { ru: "Растешь по уровням", en: "Grow through levels" },
      body: { ru: "Новые уровни открывают больше возможностей.", en: "New levels unlock more opportunities." }
    },
    {
      title: { ru: "Ведешь людей", en: "Bring people in" },
      body: { ru: "Командный рост усиливает твой маршрут.", en: "Team growth strengthens your route." }
    },
    {
      title: { ru: "Используешь Core", en: "Use Core" },
      body: { ru: "Core можно обменивать, копить или реинвестировать в цели.", en: "Core can be exchanged, saved, or reinvested into goals." }
    }
  ],
  questions: {
    time: {
      title: { ru: "Сколько времени в день готов уделять?", en: "How much time can you spend daily?" },
      options: [
        { id: "short", label: { ru: "15 мин", en: "15 min" }, range: [35, 55] },
        { id: "medium", label: { ru: "1 час", en: "1 hour" }, range: [85, 120] },
        { id: "deep", label: { ru: "3+ часа", en: "3+ hours" }, range: [160, 240] }
      ]
    },
    goal: {
      title: { ru: "Главная цель на ближайшие 3 месяца", en: "Main goal for the next 3 months" },
      placeholder: { ru: "Новый ноутбук, долги, первые клиенты", en: "New laptop, debt, first clients" }
    },
    referrals: {
      title: { ru: "Сколько человек можешь позвать?", en: "How many people could you invite?" },
      placeholder: { ru: "Например, 3", en: "For example, 3" }
    }
  },
  potentialRules: {
    referralCoreRange: [8, 14],
    levelHint: {
      ru: "Участники с похожими вводными обычно закрывают первые уровни за 2-3 недели.",
      en: "People with similar inputs usually complete the first levels in 2-3 weeks."
    },
    disclaimer: {
      ru: "Это сценарий для старта, а не обещание дохода.",
      en: "This is a starting scenario, not an income promise."
    }
  },
  actions: {
    viewFeed: { ru: "Посмотреть ленту участников", en: "View participant feed" },
    viewExamples: { ru: "Посмотреть примеры", en: "View examples" },
    continue: { ru: "Дальше", en: "Continue" },
    estimate: { ru: "Прикинуть потенциал", en: "Estimate potential" },
    createAccount: { ru: "Создать аккаунт через Google", en: "Create account with Google" },
    browseMore: { ru: "Пока нет, посмотрю еще", en: "Not yet, I will look around" },
    back: { ru: "Назад", en: "Back" }
  }
};

export function onboardingText(value: LocalizedText, locale: AppLocale): string {
  return value[locale] ?? value.en;
}
