// Small dictionary for the day-card image (an Edge function with a 1 MB size limit).
// It must not import the full dictionaries; `pnpm test:i18n` checks that every value equals the one in en.ts / ru.ts.
// Only Russian and English: the image fonts cover Latin and Cyrillic.
export const CARD_MESSAGES = {
  en: {
    "reality.card.dayN": "Day {n}",
    "reality.card.level": "Level {level}",
    "reality.card.kicker.levelUp": "New level",
    "reality.card.kicker.challenge": "Challenge done",
    "reality.card.kicker.wish": "Wish fulfilled",
    "reality.card.kicker.turnover": "Turnover today",
    "reality.card.kicker.core": "Core growth today",
    "reality.card.kicker.day": "Growth reality",
    "reality.card.follow": "Follow my growth",
    "reality.card.coreTile": "Core growth",
    "social.post.level": "LVL",
    "social.post.turnover": "Turnover",
    "social.post.wins": "Wins"
  },
  ru: {
    "reality.card.dayN": "День {n}",
    "reality.card.level": "Уровень {level}",
    "reality.card.kicker.levelUp": "Новый уровень",
    "reality.card.kicker.challenge": "Челлендж выполнен",
    "reality.card.kicker.wish": "Желание исполнено",
    "reality.card.kicker.turnover": "Оборот за день",
    "reality.card.kicker.core": "Рост Core за день",
    "reality.card.kicker.day": "Реалити роста",
    "reality.card.follow": "Следи за моим ростом",
    "reality.card.coreTile": "Рост Core",
    "social.post.level": "LVL",
    "social.post.turnover": "Оборот",
    "social.post.wins": "Победы"
  }
} as const;

export type CardMessageKey = keyof (typeof CARD_MESSAGES)["en"];
