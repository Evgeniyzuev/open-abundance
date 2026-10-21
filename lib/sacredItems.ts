// Catalog of the system shop ("Лавка"): collectible symbolic items bought for internal $.
// Items are plain transferable user_artifacts after purchase and can be resold in Market.
// Prices here are the single source of truth; the server route never trusts a client price.
// Items without a price are not sold: they appear only through a contract (two items -> one of the next rarity).

export const SACRED_RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type SacredItemRarity = (typeof SACRED_RARITIES)[number];

export type SacredItem = {
  key: string;
  group: "zodiac" | "element" | "stone" | "place" | "amulet";
  glyph: string;
  rarity: SacredItemRarity;
  price?: number;
  /** Share of the price the buyer gets as Core on the first purchase from the system, set per product from its economics (0 to 0.5). */
  coreShare?: number;
  title: { ru: string; en: string };
  description: { ru: string; en: string };
};

type Row = [key: string, glyph: string, ru: string, en: string];

function build(group: SacredItem["group"], rarity: SacredItemRarity, label: { ru: string; en: string }, rows: Row[], price?: number, coreShare?: number): SacredItem[] {
  return rows.map(([key, glyph, ru, en]) => ({
    key: `${group}_${key}`,
    group,
    glyph,
    rarity,
    price,
    coreShare,
    title: { ru: `${glyph} ${ru}`, en: `${glyph} ${en}` },
    description: { ru: `${label.ru}: ${ru}.`, en: `${label.en}: ${en}.` }
  }));
}

export const SACRED_ITEMS: SacredItem[] = [
  ...build("zodiac", "common", { ru: "Знак зодиака", en: "Zodiac sign" }, [
    ["aries", "♈", "Овен", "Aries"],
    ["taurus", "♉", "Телец", "Taurus"],
    ["gemini", "♊", "Близнецы", "Gemini"],
    ["cancer", "♋", "Рак", "Cancer"],
    ["leo", "♌", "Лев", "Leo"],
    ["virgo", "♍", "Дева", "Virgo"],
    ["libra", "♎", "Весы", "Libra"],
    ["scorpio", "♏", "Скорпион", "Scorpio"],
    ["sagittarius", "♐", "Стрелец", "Sagittarius"],
    ["capricorn", "♑", "Козерог", "Capricorn"],
    ["aquarius", "♒", "Водолей", "Aquarius"],
    ["pisces", "♓", "Рыбы", "Pisces"]
  ], 3, 0.2),
  ...build("element", "uncommon", { ru: "Стихия", en: "Element" }, [
    ["fire", "✹", "Огонь", "Fire"],
    ["water", "≈", "Вода", "Water"],
    ["earth", "⛰", "Земля", "Earth"],
    ["air", "☁", "Воздух", "Air"]
  ], 10, 0.25),
  ...build("stone", "rare", { ru: "Духовный камень", en: "Spirit stone" }, [
    ["amethyst", "◆", "Аметист", "Amethyst"],
    ["quartz", "◇", "Горный хрусталь", "Rock crystal"],
    ["obsidian", "⬢", "Обсидиан", "Obsidian"],
    ["lapis", "⬣", "Лазурит", "Lapis lazuli"]
  ]),
  ...build("place", "epic", { ru: "Место силы", en: "Place of power" }, [
    ["stonehenge", "☉", "Стоунхендж", "Stonehenge"],
    ["sedona", "⚶", "Седона", "Sedona"],
    ["uluru", "✧", "Улуру", "Uluru"],
    ["machu_picchu", "❂", "Мачу-Пикчу", "Machu Picchu"]
  ]),
  ...build("amulet", "legendary", { ru: "Амулет", en: "Amulet" }, [
    ["ankh", "☥", "Анх", "Ankh"],
    ["hamsa", "✋", "Хамса", "Hamsa"],
    ["eye", "◉", "Глаз", "Eye"]
  ])
];

export function findSacredItem(key: unknown): SacredItem | null {
  return typeof key === "string" ? SACRED_ITEMS.find((item) => item.key === key) ?? null : null;
}

/** The rarity a contract of two items of `rarity` produces, or null when it is already the top one. */
export function nextSacredRarity(rarity: string): SacredItemRarity | null {
  const index = SACRED_RARITIES.indexOf(rarity as SacredItemRarity);
  return index >= 0 && index < SACRED_RARITIES.length - 1 ? SACRED_RARITIES[index + 1] : null;
}

/** Core the buyer gets for a purchase from the system: the catalog share of the price, rounded down to cents. */
export function shopCoreBonus(item: Pick<SacredItem, "price" | "coreShare">): number {
  const share = Math.min(Math.max(item.coreShare ?? 0, 0), 0.5);
  return Math.floor((item.price ?? 0) * share * 100) / 100;
}
