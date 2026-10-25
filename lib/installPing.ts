// The first id (6f3a1c52-...-1a03) was taken over by the humanity check in 20261015120000; restored in 20261025130000.
export const INSTALL_PING_CHALLENGE_ID = "0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a03";
export const INSTALL_PING_LOGIC = "install_ping_answered";
export const INSTALL_PING_QUERY_PARAM = "install_ping";

export type InstallPingState = {
  status: "none" | "waiting" | "completed" | "failed";
  round?: number;
  planned?: number;
  sent?: number;
  missed?: number;
  nextDueAt?: string | null;
  windowEndsAt?: string | null;
};

/** True when the app runs from the home screen rather than in a browser tab. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches)
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}
