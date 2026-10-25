// Catalog of Open Abundance's own products sold through the Market (BIZ-001). Each product is a Market listing of the
// OA account (env OA_SELLER_USER_ID) whose metadata.product_key points here. When a person buys one, the deal is
// accepted and delivered at once, and the content opens on /products/<key> for that buyer only. The price is not in
// the catalog: it is set when the listing is created, product by product. No imports: tested directly by node.

export type OaProduct = {
  key: string;
  title: string;
  description: string;
  category: string;
  fulfillmentDays: 1 | 3 | 7 | 14;
};

export const PRODUCT_KEY_FIELD = "product_key";

export const OA_PRODUCTS: OaProduct[] = [
  {
    key: "start-kit",
    title: "Стартовый набор мастерской: от идеи до первого клиента",
    description: "Шесть коротких листов: карточка идеи, проверка спроса, оффер, объявление на Маркете, первые люди, первая сделка. Для тех, кто хочет попробовать своё дело и не знает, с чего начать. Сделано ИИ, это бета: цена первой волны, возврат без объяснений. Дохода не обещаем: набор помогает дёшево проверить идею. После покупки откройте /products/start-kit.",
    category: "Обучение",
    fulfillmentDays: 1
  },
  {
    key: "ten-conversations",
    title: "10 разговоров с клиентами: скрипты и таблица",
    description: "Правила разговора, скрипт вопросов, таблица ответов и способ прочитать результат: за 3–5 дней понять, нужен ли ваш продукт, ничего не продавая. Сделано ИИ, это бета: цена первой волны, возврат без объяснений. После покупки откройте /products/ten-conversations.",
    category: "Обучение",
    fulfillmentDays: 1
  },
  {
    key: "first-sale-texts",
    title: "Первая продажа: тексты и ответы",
    description: "Десять готовых шаблонов для первых продаж: объявление, первое сообщение, ответы на «дорого» и «подумаю», сдача результата, просьба об отзыве, повторная продажа. Сделано ИИ, это бета: цена первой волны, возврат без объяснений. После покупки откройте /products/first-sale-texts.",
    category: "Обучение",
    fulfillmentDays: 1
  }
];

export function findOaProduct(key: unknown): OaProduct | null {
  return typeof key === "string" ? OA_PRODUCTS.find((product) => product.key === key) ?? null : null;
}

export function productKeyOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[PRODUCT_KEY_FIELD];
  return findOaProduct(value) ? (value as string) : null;
}

/** Deal states in which the buyer may open the product: accepted and delivered, or completed. */
export const PRODUCT_ACCESS_STATUSES = ["accepted", "delivered", "completed"] as const;
