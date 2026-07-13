import type { AppLocale } from "@/lib/i18n";

export type LocalizedText = Record<AppLocale, string>;
export type EffortOptionId = "light" | "steady" | "focused";

type OnboardingContent = {
  intro: {
    badge: LocalizedText;
    title: LocalizedText;
    body: LocalizedText;
  };
  story: {
    eyebrow: LocalizedText;
    title: LocalizedText;
    points: Array<{
      title: LocalizedText;
      body: LocalizedText;
    }>;
  };
  wish: {
    eyebrow: LocalizedText;
    title: LocalizedText;
    body: LocalizedText;
    placeholder: LocalizedText;
  };
  plan: {
    eyebrow: LocalizedText;
    title: LocalizedText;
    targetLabel: LocalizedText;
    targetPlaceholder: LocalizedText;
    dailyLabel: LocalizedText;
    dailyPlaceholder: LocalizedText;
    effortLabel: LocalizedText;
    effortOptions: Array<{
      id: EffortOptionId;
      label: LocalizedText;
      multiplier: number;
    }>;
  };
  result: {
    eyebrow: LocalizedText;
    title: LocalizedText;
    body: LocalizedText;
    disclaimer: LocalizedText;
  };
  actions: {
    back: LocalizedText;
    continue: LocalizedText;
    createAccount: LocalizedText;
    openFirstStep: LocalizedText;
    startPlan: LocalizedText;
  };
};

export const ONBOARDING_SEEN_STORAGE_KEY = "openAbundanceOnboardingSeen";
export const ONBOARDING_DRAFT_STORAGE_KEY = "openAbundanceOnboardingDraft";

export const onboardingContent: OnboardingContent = {
  intro: {
    badge: { ru: "Закрытый пилот", en: "Closed pilot" },
    title: { ru: "Собери первый план роста", en: "Build your first growth plan" },
    body: {
      ru: "Open Abundance начинается не с рефералов и кошелька, а с простого маршрута: желание, Core-план, действие сегодня и первый подтвержденный результат.",
      en: "Open Abundance starts with a simple route: a wish, a Core plan, today's action, and a first verified result."
    }
  },
  story: {
    eyebrow: { ru: "Как это работает", en: "How it works" },
    title: { ru: "Один недельный цикл", en: "One weekly loop" },
    points: [
      {
        title: { ru: "Желание дает смысл", en: "A wish gives direction" },
        body: { ru: "Ты выбираешь результат, ради которого ежедневный рост становится личным.", en: "You choose the result that makes daily growth personal." }
      },
      {
        title: { ru: "Core показывает траекторию", en: "Core shows the trajectory" },
        body: { ru: "План связывает цель, ежедневные действия и рост Core.", en: "The plan connects your goal, daily actions, and Core growth." }
      },
      {
        title: { ru: "Today держит фокус", en: "Today keeps focus" },
        body: { ru: "Каждый день есть одно главное действие и понятный прогресс до Core-цели.", en: "Each day has one main action and visible progress toward the Core target." }
      }
    ]
  },
  wish: {
    eyebrow: { ru: "Главное желание", en: "Main wish" },
    title: { ru: "Что ты хочешь приблизить первым?", en: "What do you want to move closer first?" },
    body: {
      ru: "Это может быть вещь, поездка, навык, первые клиенты, закрытие долга или запас свободы.",
      en: "It can be a thing, a trip, a skill, first clients, debt relief, or a freedom buffer."
    },
    placeholder: { ru: "Например: ноутбук для работы, 3 первых клиента, закрыть долг", en: "Example: work laptop, first 3 clients, pay down debt" }
  },
  plan: {
    eyebrow: { ru: "Финансовый план", en: "Financial plan" },
    title: { ru: "Сколько Core нужно и какой ритм посилен?", en: "How much Core and what daily rhythm?" },
    targetLabel: { ru: "Цель в Core, $", en: "Core target, $" },
    targetPlaceholder: { ru: "1000", en: "1000" },
    dailyLabel: { ru: "Дневная Core-цель, $", en: "Daily Core target, $" },
    dailyPlaceholder: { ru: "1", en: "1" },
    effortLabel: { ru: "Ритм на неделю", en: "Weekly rhythm" },
    effortOptions: [
      { id: "light", label: { ru: "Легко", en: "Light" }, multiplier: 0.75 },
      { id: "steady", label: { ru: "Ровно", en: "Steady" }, multiplier: 1 },
      { id: "focused", label: { ru: "Фокус", en: "Focused" }, multiplier: 1.5 }
    ]
  },
  result: {
    eyebrow: { ru: "Следующий шаг", en: "Next step" },
    title: { ru: "Начни с первого Core-пути", en: "Start with the first Core path" },
    body: {
      ru: "Мы сохраним черновик плана на этом устройстве. Дальше открой челленджи: добавь желание, рассчитай срок и добери Today Core target.",
      en: "We'll keep this draft on this device. Next, open challenges: add your wish, calculate the timeline, and reach the Today Core target."
    },
    disclaimer: {
      ru: "Это не обещание дохода, а рабочий план для закрытого пилота.",
      en: "This is not an income promise. It is a working plan for the closed pilot."
    }
  },
  actions: {
    back: { ru: "Назад", en: "Back" },
    continue: { ru: "Дальше", en: "Continue" },
    createAccount: { ru: "Сохранить через Google", en: "Save with Google" },
    openFirstStep: { ru: "Открыть первый путь", en: "Open first path" },
    startPlan: { ru: "Собрать план", en: "Build plan" }
  }
};

export function onboardingText(value: LocalizedText, locale: AppLocale): string {
  return value[locale] ?? value.en;
}
