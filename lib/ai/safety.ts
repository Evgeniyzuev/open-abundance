/**
 * Rough, free check for language about immediate harm. Shared by every private
 * AI flow so they all stop and show the same support message instead of a plan.
 */

export type SafetyPayload = {
  mode: "safety";
  title: string;
  message: string;
  actions: string[];
};

const SAFETY_PATTERNS: RegExp[] = [
  /(?:хочу|собираюсь|могу)\s+(?:убить|покончить|причинить вред)/u,
  /(?:покончу с собой|убью себя|суицид|не хочу жить)/u,
  /(?:i want to|i am going to|i might)\s+(?:kill|hurt)\s+(?:myself|someone)/u,
  /(?:suicide|end my life|don't want to live)/u
];

export function hasSafetyText(text: string): boolean {
  const value = text.toLocaleLowerCase();
  return SAFETY_PATTERNS.some((pattern) => pattern.test(value));
}

export function buildSafetyPayload(locale: "ru" | "en"): SafetyPayload {
  if (locale === "ru") {
    return {
      mode: "safety",
      title: "Сейчас важнее безопасность",
      message: "Если есть риск, что вы причините вред себе или другому человеку, не оставайтесь с этим в одиночку. ИИ-разбор сейчас не подходит.",
      actions: [
        "Позвоните в местную экстренную службу или кризисную линию.",
        "Свяжитесь с человеком, которому доверяете, и попросите побыть рядом.",
        "Отойдите от предметов и мест, которые могут быть опасны."
      ]
    };
  }
  return {
    mode: "safety",
    title: "Safety comes first right now",
    message: "If you may harm yourself or someone else, do not handle this alone. AI reflection is not the right tool right now.",
    actions: [
      "Call your local emergency service or crisis line.",
      "Contact someone you trust and ask them to stay with you.",
      "Move away from objects or places that could be dangerous."
    ]
  };
}
