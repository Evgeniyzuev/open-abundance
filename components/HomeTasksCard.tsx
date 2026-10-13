"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckSquare } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { getNextStep, isCompletedOn, isDueOn, todayKey } from "@/lib/taskSchedule";
import { getTaskCompletions, getTasks, TASKS_CHANGED_EVENT, type TaskItem } from "@/lib/tasksStore";

const MAX_VISIBLE_TASKS = 3;

type HomeTasksCardProps = {
  active: boolean;
  onOpenTask: (taskId: string) => void;
  onOpenTasks: () => void;
};

/** Shows at most three of today's local tasks, each with its next unchecked step. */
export default function HomeTasksCard({ active, onOpenTask, onOpenTasks }: HomeTasksCardProps) {
  const { t } = useUserContext();
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  const load = useCallback(async () => {
    try {
      const [stored, completions] = await Promise.all([getTasks(), getTaskCompletions()]);
      const day = todayKey();
      setTasks(stored.filter((task) => isDueOn(task, day) && !isCompletedOn(task.id, day, completions)));
    } catch {
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
    window.addEventListener(TASKS_CHANGED_EVENT, load);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, load);
  }, [active, load]);

  if (tasks.length === 0) return null;
  const visible = tasks.slice(0, MAX_VISIBLE_TASKS);
  const hiddenCount = tasks.length - visible.length;

  return (
    <section className="home-card home-tasks-card">
      <span className="home-card-label">{t("home.tasks.title")}</span>
      <ul>
        {visible.map((task) => {
          const nextStep = getNextStep(task);
          return (
            <li key={task.id}>
              <button type="button" onClick={() => onOpenTask(task.id)}>
                <CheckSquare size={18} aria-hidden="true" />
                <span>
                  <strong>{task.title}</strong>
                  {nextStep ? <small>{t("tasks.steps.next", { step: nextStep })}</small> : null}
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 ? <button className="text-button" type="button" onClick={onOpenTasks}>{t("home.tasks.more", { count: hiddenCount })}</button> : null}
    </section>
  );
}
