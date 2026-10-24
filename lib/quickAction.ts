// One-time actions opened from app shortcuts, e.g. /?view=goals.checks&quick=new-task.

export const QUICK_ACTION_PARAM = "quick";
export type QuickAction = "capture" | "new-task";
const QUICK_ACTIONS: QuickAction[] = ["capture", "new-task"];

export function parseQuickAction(search: string): QuickAction | null {
  const value = new URLSearchParams(search).get(QUICK_ACTION_PARAM);
  return QUICK_ACTIONS.find((action) => action === value) ?? null;
}

/** Returns true once for the expected action and removes it from the address, so it never repeats. */
export function takeQuickAction(expected: QuickAction): boolean {
  if (typeof window === "undefined" || parseQuickAction(window.location.search) !== expected) return false;
  const url = new URL(window.location.href);
  url.searchParams.delete(QUICK_ACTION_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}
