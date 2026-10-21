// Labels for the public marketplace pages. The page language follows the listing text: Cyrillic means Russian.
import type { AppLocale } from "@/lib/locales";

export type PublicMarketLocale = Extract<AppLocale, "en" | "ru">;

export function listingLocale(...texts: Array<string | null | undefined>): PublicMarketLocale {
  return /[Ѐ-ӿ]/.test(texts.filter(Boolean).join(" ")) ? "ru" : "en";
}

export const PUBLIC_MARKET_LABELS = {
  en: {
    market: "Marketplace",
    kind: { service: "Service", physical_good: "Goods", digital_asset: "Digital item" },
    price: "Price in Open Abundance",
    fulfillment: (days: number) => `Delivery within ${days} ${days === 1 ? "day" : "days"}`,
    seller: "Seller",
    level: "level",
    rating: (average: number, count: number) => `Rating ${average} from ${count} ${count === 1 ? "review" : "reviews"}`,
    sales: (count: number) => `Completed deals: ${count}`,
    cta: "Sign up free to contact the seller",
    ctaNote: "Open Abundance is a free community app for mutual help. Deals are made inside the app with the internal balance and rated by both sides. Contacts are not shown publicly.",
    all: "All listings",
    answers: "Answers"
  },
  ru: {
    market: "Маркетплейс",
    kind: { service: "Услуга", physical_good: "Товар", digital_asset: "Цифровой предмет" },
    price: "Цена в Open Abundance",
    fulfillment: (days: number) => `Срок выполнения: ${days} дн.`,
    seller: "Продавец",
    level: "уровень",
    rating: (average: number, count: number) => `Оценка ${average} по ${count} отзывам`,
    sales: (count: number) => `Завершённых сделок: ${count}`,
    cta: "Зарегистрироваться бесплатно и написать продавцу",
    ctaNote: "Open Abundance — бесплатное приложение сообщества взаимопомощи. Сделки проходят внутри приложения через внутренний баланс, обе стороны ставят оценку. Контакты публично не показываются.",
    all: "Все объявления",
    answers: "Ответы"
  }
} as const;
