export const INSTALL_PING_CHALLENGE_ID = "6f3a1c52-8d47-4b0e-9a15-2c7e5b9d1a03";
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
