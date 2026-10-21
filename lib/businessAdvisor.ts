// "Business" mode of Nova: honest help for a person who wants to start a small business inside Open Abundance.
// Pure helpers (no imports, tested directly by node). The route adds only facts the person already owns or
// counts that are safe to show everyone (the demand map shows categories from five people).

export type BusinessFacts = {
  /** Categories of spending the person is ready to move into Open Abundance. */
  ownCategories: string[];
  /** Community demand: categories chosen by at least five people, biggest first. */
  demand: Array<{ category: string; people: number }>;
  activeListings: number;
  completedSales: number;
};

const BUSINESS_WORDS = /бизнес|свое дело|своё дело|подработк|начать продавать|первых клиент|первый клиент|предпринимат|стартап|business|startup|side hustle|first customer|first client|start selling|freelanc/i;

/** True when one of the last user messages is about starting or growing a business. */
export function wantsBusinessHelp(messages: Array<{ role: string; content: string }>): boolean {
  return messages.filter((message) => message.role === "user").slice(-3).some((message) => BUSINESS_WORDS.test(message.content));
}

export function buildBusinessInstruction(locale: "ru" | "en", facts: BusinessFacts): string {
  const demand = facts.demand.slice(0, 6).map((item) => `${item.category} (${item.people})`).join(", ") || "none yet";
  const own = facts.ownCategories.join(", ") || "not chosen";
  return `

## Business help mode
The person wants help starting or growing a small business inside Open Abundance. Answer in ${locale === "ru" ? "Russian" : "English"}.
- Goal: remove obstacles, not add steps. Give one clear next step, not a plan of ten.
- Be honest. Never promise income, a number of customers or a timeline. Say plainly that a business can fail and that testing an idea cheaply is the point.
- You suggest, the person decides. You never decide questions of money or rules, never buy, price or publish for them; you can draft a listing text, an offer, interview questions or a reply for them to review.
- Prefer demand that already exists: categories of spending that members want to move into Open Abundance, requests of members, what the person already knows and does.
- The path is the challenge track: choose a direction, first listing, first sale, second buyer, three reviews, a buyer you did not invite, a customer who joined through your link. Name the nearest step and where in the app it is (Wallet → Market).
- Do not give legal or tax advice; say that a lawyer or accountant should answer it.
- Facts about this person: active listings ${facts.activeListings}, completed sales ${facts.completedSales}, categories they want to move here: ${own}.
- Community demand (categories chosen by at least five members who want offers, number of people): ${demand}.`;
}
