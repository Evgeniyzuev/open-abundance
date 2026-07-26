import type { TaskInput } from "@/lib/tasksStore";

export type PracticeTemplate = {
  id: string;
  emoji: string;
  titleKey: string;
  descKey: string;
  period: "daily" | "weekly";
  category: "awareness" | "habit";
};

export const PRACTICE_TEMPLATES: PracticeTemplate[] = [
  // === Из видео "Как изменить жизнь" (awareness) ===
  {
    id: "observer",
    emoji: "🧘",
    titleKey: "practice.observer.title",
    descKey: "practice.observer.desc",
    period: "daily",
    category: "awareness"
  },
  {
    id: "morning-ritual",
    emoji: "🌅",
    titleKey: "practice.morningRitual.title",
    descKey: "practice.morningRitual.desc",
    period: "daily",
    category: "awareness"
  },
  {
    id: "evening-ritual",
    emoji: "🌙",
    titleKey: "practice.eveningRitual.title",
    descKey: "practice.eveningRitual.desc",
    period: "daily",
    category: "awareness"
  },
  {
    id: "energy-audit",
    emoji: "⚡",
    titleKey: "practice.energyAudit.title",
    descKey: "practice.energyAudit.desc",
    period: "weekly",
    category: "awareness"
  },
  {
    id: "state-switch",
    emoji: "🔄",
    titleKey: "practice.stateSwitch.title",
    descKey: "practice.stateSwitch.desc",
    period: "daily",
    category: "awareness"
  },
  {
    id: "focus-fixation",
    emoji: "🎯",
    titleKey: "practice.focusFixation.title",
    descKey: "practice.focusFixation.desc",
    period: "daily",
    category: "awareness"
  },
  {
    id: "child-state",
    emoji: "🧒",
    titleKey: "practice.childState.title",
    descKey: "practice.childState.desc",
    period: "weekly",
    category: "awareness"
  },

  // === Популярные привычки (habit) ===
  {
    id: "liberation",
    emoji: "🕊️",
    titleKey: "practice.liberation.title",
    descKey: "practice.liberation.desc",
    period: "daily",
    category: "habit"
  },
  {
    id: "healthy-eating",
    emoji: "🥗",
    titleKey: "practice.healthyEating.title",
    descKey: "practice.healthyEating.desc",
    period: "daily",
    category: "habit"
  },
  {
    id: "physical-activity",
    emoji: "💪",
    titleKey: "practice.physicalActivity.title",
    descKey: "practice.physicalActivity.desc",
    period: "daily",
    category: "habit"
  },
  {
    id: "new-acquaintances",
    emoji: "👋",
    titleKey: "practice.newAcquaintances.title",
    descKey: "practice.newAcquaintances.desc",
    period: "daily",
    category: "habit"
  },
  {
    id: "share-interests",
    emoji: "🗣️",
    titleKey: "practice.shareInterests.title",
    descKey: "practice.shareInterests.desc",
    period: "daily",
    category: "habit"
  },
  {
    id: "tell-about-abundance",
    emoji: "📢",
    titleKey: "practice.tellAboutAbundance.title",
    descKey: "practice.tellAboutAbundance.desc",
    period: "daily",
    category: "habit"
  },
  {
    id: "reading",
    emoji: "📚",
    titleKey: "practice.reading.title",
    descKey: "practice.reading.desc",
    period: "daily",
    category: "habit"
  },
  {
    id: "meditation",
    emoji: "🧠",
    titleKey: "practice.meditation.title",
    descKey: "practice.meditation.desc",
    period: "daily",
    category: "habit"
  },
  {
    id: "early-rise",
    emoji: "⏰",
    titleKey: "practice.earlyRise.title",
    descKey: "practice.earlyRise.desc",
    period: "daily",
    category: "habit"
  },
  {
    id: "digital-detox",
    emoji: "📵",
    titleKey: "practice.digitalDetox.title",
    descKey: "practice.digitalDetox.desc",
    period: "daily",
    category: "habit"
  },
  {
    id: "order-in-space",
    emoji: "🏠",
    titleKey: "practice.orderInSpace.title",
    descKey: "practice.orderInSpace.desc",
    period: "daily",
    category: "habit"
  }
];

export function buildPracticeTask(template: PracticeTemplate): TaskInput {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  return {
    id: crypto.randomUUID(),
    title: `${template.emoji} ${template.titleKey}`,
    description: template.descKey,
    schedule: {
      type: "daily",
      startDate: today,
      infinite: true
    },
    streak: {
      softMode: true,
      initialLives: 0,
      livesEveryDays: 0
    },
    syncStatus: "local"
  };
}