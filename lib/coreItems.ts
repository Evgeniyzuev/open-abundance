// Catalog of Core items ("Сад Core"): collectible garden items whose first purchase from the system
// moves exactly their price from Wallet to the buyer's Core. No bonus on top of the price: an item
// creates no new Core, its value is the collection. A resale in Market is an ordinary item deal.
// Prices here are the single source of truth; the server route never trusts a client price.
// No imports: the contract test reads this file directly with node.

export type CoreItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type CoreItem = {
  key: string;
  glyph: string;
  rarity: CoreItemRarity;
  price: number;
  title: { ru: string; en: string };
  lore: { ru: string; en: string };
};

export const CORE_ITEMS: CoreItem[] = [
  {
    key: "core_apple_seed",
    glyph: "•",
    rarity: "common",
    price: 1,
    title: { ru: "Семечко яблони", en: "Apple seed" },
    lore: { ru: "С него начинается любой сад. Маленькое, но в нём уже есть всё дерево.", en: "Every orchard starts here. Small, yet the whole tree is already inside." }
  },
  {
    key: "core_watering_can",
    glyph: "☂",
    rarity: "uncommon",
    price: 5,
    title: { ru: "Лейка", en: "Watering can" },
    lore: { ru: "Каждый день понемногу. Сад растёт от регулярности, а не от одного ливня.", en: "A little every day. An orchard grows from regular care, not from one downpour." }
  },
  {
    key: "core_living_soil",
    glyph: "⛰",
    rarity: "rare",
    price: 20,
    title: { ru: "Живая земля", en: "Living soil" },
    lore: { ru: "Корни уходят глубже, когда им есть за что держаться.", en: "Roots go deeper when they have something to hold on to." }
  },
  {
    key: "core_sun_stone",
    glyph: "☀",
    rarity: "epic",
    price: 100,
    title: { ru: "Солнечный камень", en: "Sun stone" },
    lore: { ru: "Хранит тепло долгих летних дней и отдаёт его саду.", en: "Keeps the warmth of long summer days and gives it back to the orchard." }
  },
  {
    key: "core_golden_apple",
    glyph: "◉",
    rarity: "legendary",
    price: 500,
    title: { ru: "Золотое яблоко", en: "Golden apple" },
    lore: { ru: "Плод, ради которого сажают сады. Говорят, его семечки прорастают в новых садах.", en: "The fruit orchards are planted for. They say its seeds sprout into new orchards." }
  }
];

export function findCoreItem(key: unknown): CoreItem | null {
  return typeof key === "string" ? CORE_ITEMS.find((item) => item.key === key) ?? null : null;
}
