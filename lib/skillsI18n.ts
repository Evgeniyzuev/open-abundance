import type { AppLocale } from "@/lib/i18n";

const skillMessages = {
  ru: {
    title: "Навыки",
    coreLevel: "Core {level}",
    earned: "Заработано",
    effective: "Доступно сейчас",
    unverified: "В прогрессе",
    verified: "Подтверждено автоматически",
    loading: "Загружаем Skill Passport…",
    error: "Не удалось загрузить Skill Passport.",
    refresh: "Проверить прогресс",
    refreshing: "Проверяем…",
    refreshed: "Прогресс обновлён.",
    level: "Уровень",
    nextCheck: "Следующая автоматическая проверка",
    completedLevel: "Уровень L{level} достигнут",
    completed: "Достигнут",
    current: "Сейчас",
    target: "Цель",
    noCheck: "Для этого навыка автоматическое правило ещё готовится.",
    referralCount: "Количество подтверждённых приглашённых участников",
    publicPostCount: "Количество публичных опубликованных материалов",
    teamMemberCount: "Количество активных участников в команде",
    teamContactCount: "Количество активных контактов команды",
    challengeCompletionCount: "Количество завершённых челленджей"
  },
  en: {
    title: "Skills",
    coreLevel: "Core {level}",
    earned: "Earned",
    effective: "Available now",
    unverified: "In progress",
    verified: "Automatically verified",
    loading: "Loading Skill Passport…",
    error: "Could not load Skill Passport.",
    refresh: "Check progress",
    refreshing: "Checking…",
    refreshed: "Progress updated.",
    level: "Level",
    nextCheck: "Next automatic check",
    completedLevel: "Level L{level} reached",
    completed: "Reached",
    current: "Now",
    target: "Target",
    noCheck: "An automatic rule for this skill is still being prepared.",
    referralCount: "Confirmed referred participants",
    publicPostCount: "Public published posts",
    teamMemberCount: "Active team members",
    teamContactCount: "Active team contacts",
    challengeCompletionCount: "Completed challenges"
  }
} as const;

export type SkillMessageKey = keyof typeof skillMessages.en;

export function skillTranslate(locale: AppLocale, key: SkillMessageKey, values?: Record<string, string | number>): string {
  const template: string = skillMessages[locale][key] ?? skillMessages.en[key];
  if (!values) return template;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}
