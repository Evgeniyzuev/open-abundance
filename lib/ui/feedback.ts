import { prefersLessMotion } from "@/lib/attention";
import { playUiSound } from "@/lib/ui/sound";

/**
 * One consistent, instant response to a completed action: a short pulse on the element
 * and the action sound when the person turned sounds on. No motion with reduced motion.
 */
export function celebrate(element: Element | null, sound: "action" | "reward" = "action"): void {
  playUiSound(sound);
  if (!element || typeof window === "undefined") return;
  if (prefersLessMotion()) return;
  element.classList.remove("oa-pop");
  // Restart the animation when the same element is tapped again.
  void (element as HTMLElement).offsetWidth;
  element.classList.add("oa-pop");
  element.addEventListener("animationend", () => element.classList.remove("oa-pop"), { once: true });
}
