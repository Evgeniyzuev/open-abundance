"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { isCompletedOn, todayKey } from "@/lib/taskSchedule";
import { getTaskCompletions, getTasks, rescheduleOnceTask, TASKS_CHANGED_EVENT, type TaskItem } from "@/lib/tasksStore";

/** True for an open "what's next" task whose day has come, including one left from an earlier day. */
export function isContinueTaskDue(task: TaskItem, day: string): boolean {
  return Boolean(task.continueFrom) && !task.completed && !task.deleted && task.schedule.type === "once" && task.schedule.date <= day;
}

/** The first line of Home: the step the person left for themselves when they finished last time. */
export default function HomeContinueCard({ active, onOpenTask }: { active: boolean; onOpenTask: (taskId: string) => void }) {
  const { t } = useUserContext();
  const [task, setTask] = useState<TaskItem | null>(null);

  const load = useCallback(async () => {
    try {
      const [stored, completions] = await Promise.all([getTasks(), getTaskCompletions()]);
      const day = todayKey();
      const due = stored
        .filter((item) => isContinueTaskDue(item, day) && !isCompletedOn(item.id, day, completions))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      setTask(due[0] ?? null);
    } catch {
      setTask(null);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
    window.addEventListener(TASKS_CHANGED_EVENT, load);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, load);
  }, [active, load]);

  if (!task) return null;

  async function open(current: TaskItem) {
    // A hook left for a day that has passed moves to today, so its card can be marked done.
    const day = todayKey();
    if (current.schedule.type === "once" && current.schedule.date < day) await rescheduleOnceTask(current.id, day);
    onOpenTask(current.id);
  }

  return (
    <button className="home-card home-continue-card" type="button" onClick={() => void open(task)}>
      <span>
        <small className="home-card-label">{t("nextHook.continue")}</small>
        <strong>{task.title}</strong>
      </span>
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}
