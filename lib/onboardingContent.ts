import type { AppLocale } from "@/lib/i18n";

export type LocalizedText = Record<AppLocale, string>;

type OnboardingContent = {
  brand: LocalizedText;
  mission: {
    eyebrow: LocalizedText;
    title: LocalizedText;
    body: LocalizedText;
    imageAlt: LocalizedText;
  };
  stories: {
    eyebrow: LocalizedText;
    title: LocalizedText;
    body: LocalizedText;
    imageAlt: LocalizedText;
  };
  program: {
    eyebrow: LocalizedText;
    title: LocalizedText;
    body: LocalizedText;
    prompt: LocalizedText;
    imageAlt: LocalizedText;
  };
  actions: {
    back: LocalizedText;
    calculatePath: LocalizedText;
    continue: LocalizedText;
    startFirstTask: LocalizedText;
    viewStories: LocalizedText;
  };
  errors: {
    complete: LocalizedText;
  };
};

export const ONBOARDING_SEEN_STORAGE_KEY = "openAbundanceOnboardingSeen";
export const ONBOARDING_DRAFT_STORAGE_KEY = "openAbundanceOnboardingDraft";

export const onboardingContent: OnboardingContent = {
  brand: { ru: "Open Abundance", en: "Open Abundance" },
  mission: {
    eyebrow: { ru: "Первый ИИ-инструмент изобилия", en: "The first AI abundance tool" },
    title: { ru: "Создавай изобилие в своей жизни", en: "Create abundance in your life" },
    body: {
      ru: "Выбирай желания — Open Abundance превратит их в понятный маршрут. Двигайся к своим целям на полной скорости!✈️",
      en: "Choose your wishes — Open Abundance will turn them into a clear route. Move toward your goals at full speed ✈️"
    },
    imageAlt: {
      ru: "Светящийся ИИ превращает желания человека в маршрут возможностей",
      en: "A glowing AI turns a person's wishes into a path of opportunities"
    }
  },
  stories: {
    eyebrow: { ru: "Истории Abundance", en: "Abundance stories" },
    title: { ru: "У других уже получилось", en: "Others are already succeeding" },
    body: {
      ru: "Посмотри, как участники Open Abundance решают проблемы, достигают целей и меняют свою жизнь.",
      en: "See how Open Abundance members solve problems, reach goals, and change their lives."
    },
    imageAlt: {
      ru: "Три участника радуются достигнутым творческим, рабочим и личным целям",
      en: "Three members celebrate creative, professional, and personal goals"
    }
  },
  program: {
    eyebrow: { ru: "Твой маршрут", en: "Your route" },
    title: { ru: "20 уровней до 1 000 000 $", en: "20 levels to $1,000,000" },
    body: {
      ru: "Выполняй простые задания, развивай навыки и получай денежные награды. Чем выше уровень — тем больше возможностей и доход.",
      en: "Complete simple tasks, build skills, and earn cash rewards. Higher levels bring more opportunities and income."
    },
    prompt: {
      ru: "Узнай, как быстро ты сможешь пройти всю программу.",
      en: "Find out how quickly you can complete the full program."
    },
    imageAlt: {
      ru: "Путь из двадцати уровней поднимается к сияющей вершине",
      en: "A twenty-level path climbs toward a radiant summit"
    }
  },
  actions: {
    back: { ru: "Назад", en: "Back" },
    calculatePath: { ru: "Рассчитать мой путь", en: "Calculate my path" },
    continue: { ru: "Продолжить", en: "Continue" },
    startFirstTask: { ru: "Начать первое задание", en: "Start the first task" },
    viewStories: { ru: "Смотреть истории", en: "View stories" }
  },
  errors: {
    complete: { ru: "Не удалось открыть следующий экран.", en: "Could not open the next screen." }
  }
};

export function onboardingText(value: LocalizedText, locale: AppLocale): string {
  return value[locale] ?? value.en;
}
