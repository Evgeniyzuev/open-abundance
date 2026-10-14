export type FutureDayMood = "idle" | "morning" | "day" | "celebrate";

export type FutureDay = {
  planned: number;
  done: number;
  /** Share of today's planned tasks that are done, 0..1. */
  ratio: number;
  mood: FutureDayMood;
};

export const IDLE_FUTURE_DAY: FutureDay = { planned: 0, done: 0, ratio: 0, mood: "idle" };

/**
 * "Day of the future": how today's real tasks move the sim's scene. The sun climbs with the share of done tasks
 * and the figure celebrates when all of them are done. Missed tasks only mean the sun stays low, never a penalty.
 * The caller decides which tasks are planned for today and which of them have a completion for today.
 */
export function computeFutureDay(plannedTaskIds: string[], completedTaskIds: Iterable<string>): FutureDay {
  const planned = new Set(plannedTaskIds);
  const completed = new Set(completedTaskIds);
  const done = [...planned].filter((id) => completed.has(id)).length;
  const ratio = planned.size ? done / planned.size : 0;
  const mood: FutureDayMood = planned.size === 0 ? "idle" : ratio >= 1 ? "celebrate" : done === 0 ? "morning" : "day";
  return { planned: planned.size, done, ratio, mood };
}
