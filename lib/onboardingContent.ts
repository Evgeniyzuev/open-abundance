import { detectPreferredLocale, type AppLocale } from "@/lib/i18n";

export type OnboardingLocale = AppLocale | "zh" | "es" | "hi";
export type OnboardingLocalizedText = Record<OnboardingLocale, string>;

export const ONBOARDING_LOCALES: OnboardingLocale[] = ["ru", "en", "zh", "es", "hi"];
export const ONBOARDING_LOCALE_STORAGE_KEY = "openAbundanceOnboardingLocale";
export const ONBOARDING_LOCALE_LABELS: Record<OnboardingLocale, string> = {
  ru: "RU",
  en: "EN",
  zh: "中文",
  es: "ES",
  hi: "HI"
};

type OnboardingContent = {
  brand: OnboardingLocalizedText;
  mission: {
    eyebrow: OnboardingLocalizedText;
    title: OnboardingLocalizedText;
    body: OnboardingLocalizedText;
    imageAlt: OnboardingLocalizedText;
  };
  stories: {
    eyebrow: OnboardingLocalizedText;
    title: OnboardingLocalizedText;
    body: OnboardingLocalizedText;
    imageAlt: OnboardingLocalizedText;
  };
  program: {
    eyebrow: OnboardingLocalizedText;
    title: OnboardingLocalizedText;
    body: OnboardingLocalizedText;
    prompt: OnboardingLocalizedText;
    imageAlt: OnboardingLocalizedText;
  };
  actions: {
    back: OnboardingLocalizedText;
    calculatePath: OnboardingLocalizedText;
    continue: OnboardingLocalizedText;
    language: OnboardingLocalizedText;
    startFirstTask: OnboardingLocalizedText;
    viewStories: OnboardingLocalizedText;
  };
  errors: {
    complete: OnboardingLocalizedText;
  };
};

export const ONBOARDING_SEEN_STORAGE_KEY = "openAbundanceOnboardingSeen";
export const ONBOARDING_DRAFT_STORAGE_KEY = "openAbundanceOnboardingDraft";

export const onboardingContent: OnboardingContent = {
  brand: { ru: "Open Abundance", en: "Open Abundance", zh: "Open Abundance", es: "Open Abundance", hi: "Open Abundance" },
  mission: {
    eyebrow: {
      ru: "Первый ИИ-инструмент изобилия",
      en: "The first AI abundance tool",
      zh: "第一个 AI 丰盛工具",
      es: "La primera herramienta de abundancia con IA",
      hi: "बहुतायत के लिए पहला AI टूल"
    },
    title: {
      ru: "Создавай изобилие в своей жизни",
      en: "Create abundance in your life",
      zh: "在生活中创造丰盛",
      es: "Crea abundancia en tu vida",
      hi: "अपने जीवन में समृद्धि बनाएं"
    },
    body: {
      ru: "Выбирай желания — Open Abundance превратит их в понятный маршрут. Двигайся к своим целям быстрее и увереннее ✈️",
      en: "Choose your wishes — Open Abundance will turn them into a clear route. Move toward your goals faster and with greater confidence ✈️",
      zh: "选择你的愿望——Open Abundance 会把它们变成清晰的路线。更快、更有信心地走向你的目标 ✈️",
      es: "Elige tus deseos: Open Abundance los convertirá en una ruta clara. Avanza hacia tus objetivos más rápido y con más confianza ✈️",
      hi: "अपनी इच्छाएं चुनें — Open Abundance उन्हें एक स्पष्ट मार्ग में बदलेगा। अपने लक्ष्यों की ओर तेज़ी और भरोसे के साथ बढ़ें ✈️"
    },
    imageAlt: {
      ru: "Светящийся ИИ превращает желания человека в маршрут возможностей",
      en: "A glowing AI turns a person's wishes into a path of opportunities",
      zh: "发光的人工智能把一个人的愿望变成通往机会的路线",
      es: "Una IA luminosa convierte los deseos de una persona en una ruta de oportunidades",
      hi: "एक चमकदार AI व्यक्ति की इच्छाओं को अवसरों की राह में बदलता है"
    }
  },
  stories: {
    eyebrow: {
      ru: "Истории Abundance",
      en: "Abundance stories",
      zh: "Abundance 故事",
      es: "Historias de Abundance",
      hi: "Abundance की कहानियां"
    },
    title: {
      ru: "У других уже получилось",
      en: "Others are already succeeding",
      zh: "别人已经做到了",
      es: "Otros ya lo están logrando",
      hi: "दूसरे लोग पहले ही कर चुके हैं"
    },
    body: {
      ru: "Посмотри, как участники Open Abundance решают проблемы, достигают целей и меняют свою жизнь.",
      en: "See how Open Abundance members solve problems, reach goals, and change their lives.",
      zh: "看看 Open Abundance 的参与者如何解决问题、实现目标并改变生活。",
      es: "Descubre cómo los participantes de Open Abundance resuelven problemas, alcanzan objetivos y cambian sus vidas.",
      hi: "देखें कि Open Abundance के प्रतिभागी समस्याएं कैसे हल करते हैं, लक्ष्य कैसे हासिल करते हैं और अपना जीवन कैसे बदलते हैं।"
    },
    imageAlt: {
      ru: "Три участника радуются достигнутым творческим, рабочим и личным целям",
      en: "Three members celebrate creative, professional, and personal goals",
      zh: "三位参与者庆祝实现了创意、职业和个人目标",
      es: "Tres participantes celebran sus objetivos creativos, profesionales y personales",
      hi: "तीन प्रतिभागी रचनात्मक, पेशेवर और व्यक्तिगत लक्ष्यों की खुशी मनाते हैं"
    }
  },
  program: {
    eyebrow: {
      ru: "Твой маршрут",
      en: "Your route",
      zh: "你的路线",
      es: "Tu ruta",
      hi: "आपका मार्ग"
    },
    title: {
      ru: "20 уровней до 1 000 000 $",
      en: "20 levels to $1,000,000",
      zh: "20 个等级，直到 1,000,000 美元",
      es: "20 niveles hasta 1.000.000 $",
      hi: "1,000,000 डॉलर तक 20 स्तर"
    },
    body: {
      ru: "Выполняй простые задания, развивай навыки и получай денежные награды. Чем выше уровень — тем больше возможностей и доход.",
      en: "Complete simple tasks, build skills, and earn cash rewards. Higher levels bring more opportunities and income.",
      zh: "完成简单任务，培养技能并获得现金奖励。等级越高，机会和收入越多。",
      es: "Completa tareas sencillas, desarrolla habilidades y recibe recompensas en efectivo. Cuanto más alto sea el nivel, más oportunidades e ingresos tendrás.",
      hi: "सरल कार्य पूरे करें, कौशल विकसित करें और नकद पुरस्कार पाएं। स्तर जितना ऊंचा होगा, अवसर और आय उतनी अधिक होगी।"
    },
    prompt: {
      ru: "Узнай, как быстро ты сможешь пройти всю программу.",
      en: "Find out how quickly you can complete the full program.",
      zh: "看看你能多快完成整个计划。",
      es: "Descubre qué tan rápido puedes completar todo el programa.",
      hi: "जानें कि आप पूरा कार्यक्रम कितनी जल्दी पूरा कर सकते हैं।"
    },
    imageAlt: {
      ru: "Путь из двадцати уровней поднимается к сияющей вершине",
      en: "A twenty-level path climbs toward a radiant summit",
      zh: "一条二十级的道路通向光芒四射的顶峰",
      es: "Un camino de veinte niveles asciende hacia una cumbre radiante",
      hi: "बीस स्तरों का मार्ग एक उज्ज्वल शिखर की ओर बढ़ता है"
    }
  },
  actions: {
    back: { ru: "Назад", en: "Back", zh: "返回", es: "Atrás", hi: "वापस" },
    calculatePath: {
      ru: "Рассчитать мой путь",
      en: "Calculate my path",
      zh: "计算我的路线",
      es: "Calcular mi ruta",
      hi: "मेरा मार्ग जानें"
    },
    continue: { ru: "Продолжить", en: "Continue", zh: "继续", es: "Continuar", hi: "जारी रखें" },
    language: { ru: "Язык", en: "Language", zh: "语言", es: "Idioma", hi: "भाषा" },
    startFirstTask: {
      ru: "Начать первое задание",
      en: "Start the first task",
      zh: "开始第一个任务",
      es: "Empezar la primera tarea",
      hi: "पहला कार्य शुरू करें"
    },
    viewStories: { ru: "Смотреть истории", en: "View stories", zh: "查看故事", es: "Ver historias", hi: "कहानियां देखें" }
  },
  errors: {
    complete: {
      ru: "Не удалось открыть следующий экран.",
      en: "Could not open the next screen.",
      zh: "无法打开下一步。",
      es: "No se pudo abrir la siguiente pantalla.",
      hi: "अगली स्क्रीन नहीं खुल सकी।"
    }
  }
};

export function onboardingText(value: OnboardingLocalizedText, locale: OnboardingLocale): string {
  return value[locale] ?? value.en;
}

export function normalizeOnboardingLocale(value: unknown): OnboardingLocale {
  return ONBOARDING_LOCALES.includes(value as OnboardingLocale) ? value as OnboardingLocale : "en";
}

export function detectOnboardingBrowserLocale(): OnboardingLocale {
  if (typeof navigator === "undefined") return "en";
  const candidates = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const value of candidates) {
    const language = value.toLowerCase();
    if (language.startsWith("ru")) return "ru";
    if (language.startsWith("zh")) return "zh";
    if (language.startsWith("es")) return "es";
    if (language.startsWith("hi")) return "hi";
  }
  return "en";
}

export function detectPreferredOnboardingLocale(): OnboardingLocale {
  if (typeof window === "undefined") return "en";

  try {
    const storedLocale = window.localStorage.getItem(ONBOARDING_LOCALE_STORAGE_KEY);
    if (storedLocale) return normalizeOnboardingLocale(storedLocale);
  } catch {
    // Browser language remains a safe fallback when storage is unavailable.
  }

  return detectOnboardingBrowserLocale();
}

export function storeOnboardingLocalePreference(locale: OnboardingLocale): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ONBOARDING_LOCALE_STORAGE_KEY, normalizeOnboardingLocale(locale));
  } catch {
    // The in-memory locale still works when storage is unavailable.
  }
}

export function getOnboardingRegistrationLocale(): AppLocale {
  if (typeof window !== "undefined") {
    try {
      const storedLocale = window.localStorage.getItem(ONBOARDING_LOCALE_STORAGE_KEY);
      if (storedLocale) return normalizeOnboardingLocale(storedLocale) === "ru" ? "ru" : "en";
    } catch {
      // The app locale remains a safe fallback when storage is unavailable.
    }
  }

  return detectPreferredLocale();
}
