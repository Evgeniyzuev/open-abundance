// Pure gesture helpers (no imports, tested directly by node).

export const SWIPE_MIN_DISTANCE = 64;

/**
 * A horizontal swipe counts only when it is long enough and clearly more horizontal than
 * vertical, so normal scrolling inside a post never triggers a signal.
 */
export function classifySwipe(dx: number, dy: number, minDistance = SWIPE_MIN_DISTANCE): "left" | "right" | null {
  if (Math.abs(dx) < minDistance) return null;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx > 0 ? "right" : "left";
}

/** Next index in a finite sequence, or null at the end (no wrap-around, no auto-loading). */
export function nextInSequence(index: number, length: number, direction: 1 | -1): number | null {
  const next = index + direction;
  return next >= 0 && next < length ? next : null;
}
