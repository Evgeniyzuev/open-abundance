// Pure rules of the "Core grew" popup (no imports, tested directly by node).
// The popup is display only: it shows the tree reacting to a top-up and changes no balance.

export const GROWTH_POPUP_KEY = "oa.coreGrowthPopup";
/** Any real rise opens the popup: only an announced top-up or purchase can, so accruals stay quiet. */
export const GROWTH_POPUP_MIN = 1e-9;
/** A purchase or top-up announces itself; a rise counts only while the announcement is fresh. */
export const GROWTH_POPUP_WINDOW_MS = 30_000;

/** The popup is on unless the person switched it off. */
export function parseGrowthPopupSetting(raw: string | null | undefined): boolean {
  return raw !== "0";
}

export type GrowthAnnouncement = { balance: number; expiresAt: number };

export function shouldShowGrowthPopup(input: { announced: GrowthAnnouncement | null; next: number; enabled: boolean; now: number }): boolean {
  const { announced, next, enabled, now } = input;
  if (!enabled || !announced) return false;
  if (now > announced.expiresAt) return false;
  if (!Number.isFinite(next) || !Number.isFinite(announced.balance)) return false;
  return next - announced.balance >= GROWTH_POPUP_MIN;
}
