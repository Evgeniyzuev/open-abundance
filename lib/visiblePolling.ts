// Polling that only runs while the page is visible (no imports, tested directly by node).
// Hidden tab: no requests. Back to visible: one immediate check, then the usual interval.
// Server-side settlement (webhooks, chain scanners) never depends on these checks.

/** Starts polling and returns a stop function; drop-in replacement for setInterval/clearInterval. */
export function startVisiblePolling(callback: () => void, intervalMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const isVisible = () => document.visibilityState === "visible";
  const startTimer = () => {
    if (timer === null) timer = setInterval(callback, intervalMs);
  };
  const stopTimer = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const onVisibilityChange = () => {
    if (stopped) return;
    if (isVisible()) {
      callback();
      startTimer();
    } else {
      stopTimer();
    }
  };

  if (isVisible()) startTimer();
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    stopped = true;
    stopTimer();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
