import type { Tables } from "@/lib/database.types";

export const PRIMARY_WISH_CHANGED_EVENT = "open-abundance-primary-wish-changed";

export type PrimaryWishSummary = Pick<
  Tables<"wishes">,
  "id" | "title" | "description" | "category" | "image_url" | "target_amount" | "target_currency"
>;

const STORY_WISH_RECOMMENDATIONS: Record<string, string> = {
  "reality_demo:from-burnout-to-freelance": "b9100000-0000-4000-8000-000000000004",
  "reality_demo:careful-career-exit": "b9100000-0000-4000-8000-000000000003",
  "reality_demo:first-product-launch": "b9100000-0000-4000-8000-000000000005",
  "reality_demo:traveling-consultant": "b9100000-0000-4000-8000-000000000007",
  "reality_demo:parent-flexible-income": "b9100000-0000-4000-8000-000000000008",
  "reality_demo:dream-home-project": "b9100000-0000-4000-8000-000000000002",
  "editorial_story:front-row": "b9100000-0000-4000-8000-000000000004",
  "editorial_story:first-order": "b9100000-0000-4000-8000-000000000005",
  "editorial_story:sea-for-mom": "b9100000-0000-4000-8000-000000000008",
  "editorial_story:our-own-key": "b9100000-0000-4000-8000-000000000002",
  "editorial_story:drawing-again": "b9100000-0000-4000-8000-000000000004"
};

export function recommendedWishIdForStory(sourceKey: string | null): string | null {
  return sourceKey ? STORY_WISH_RECOMMENDATIONS[sourceKey] ?? null : null;
}

export function readPrimaryWish(userId: string | null | undefined): PrimaryWishSummary | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(primaryWishStorageKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PrimaryWishSummary>;
    return typeof value.id === "string" && typeof value.title === "string"
      ? {
        id: value.id,
        title: value.title,
        description: typeof value.description === "string" ? value.description : "",
        category: typeof value.category === "string" ? value.category : null,
        image_url: typeof value.image_url === "string" ? value.image_url : null,
        target_amount: typeof value.target_amount === "number" ? value.target_amount : null,
        target_currency: typeof value.target_currency === "string" ? value.target_currency : "USD"
      }
      : null;
  } catch {
    return null;
  }
}

export function storePrimaryWish(userId: string, wish: PrimaryWishSummary | null): void {
  if (typeof window === "undefined") return;
  try {
    if (wish) window.localStorage.setItem(primaryWishStorageKey(userId), JSON.stringify(wish));
    else window.localStorage.removeItem(primaryWishStorageKey(userId));
  } catch {
    // The selected wish remains usable in the current component when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(PRIMARY_WISH_CHANGED_EVENT, { detail: { userId, wish } }));
}

export function calculateWishJourney(input: {
  coreBalance: number;
  reinvestPercent: number;
  targetAmount: number | null;
  walletBalance: number;
}) {
  const dailyGrossIncome = Math.max(0, input.coreBalance) * 0.000633;
  const dailyAvailableIncome = dailyGrossIncome * (1 - Math.min(100, Math.max(0, input.reinvestPercent)) / 100);
  const targetAmount = input.targetAmount && input.targetAmount > 0 ? input.targetAmount : null;
  const savedAmount = targetAmount === null ? 0 : Math.min(targetAmount, Math.max(0, input.walletBalance));
  const remainingAmount = targetAmount === null ? null : Math.max(0, targetAmount - savedAmount);
  const estimatedDays = remainingAmount === null || remainingAmount === 0
    ? remainingAmount
    : dailyAvailableIncome > 0 ? Math.ceil(remainingAmount / dailyAvailableIncome) : null;

  return { dailyAvailableIncome, dailyGrossIncome, estimatedDays, remainingAmount, savedAmount, targetAmount };
}

export function readWishMilestone(userId: string | null | undefined, wishId: string | null | undefined): string {
  if (!userId || !wishId || typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(wishMilestoneStorageKey(userId, wishId)) ?? "";
  } catch {
    return "";
  }
}

export function storeWishMilestone(userId: string, wishId: string, milestone: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(wishMilestoneStorageKey(userId, wishId), milestone.trim());
  } catch {
    // The current screen still keeps the milestone when storage is unavailable.
  }
}

function primaryWishStorageKey(userId: string): string {
  return `open-abundance-primary-wish:${userId}`;
}

function wishMilestoneStorageKey(userId: string, wishId: string): string {
  return `open-abundance-wish-milestone:${userId}:${wishId}`;
}
