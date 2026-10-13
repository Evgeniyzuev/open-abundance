"use client";

import { useMemo, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { getWeekDays, isCompletedOn, isPlannedOn, parseDateKey } from "@/lib/taskSchedule";
import type { TaskCompletion, TaskItem } from "@/lib/tasksStore";

type TaskWeekOverviewProps = {
  tasks: TaskItem[];
  completions: TaskCompletion[];
  today: string;
  onOpenTask: (taskId: string) => void;
};

/** Seven-day view over all active tasks, built from the data already loaded by the Tasks screen. */
export default function TaskWeekOverview({ tasks, completions, today, onOpenTask }: TaskWeekOverviewProps) {
  const { locale } = useUserContext();
  const [selectedDay, setSelectedDay] = useState(today);
  const days = useMemo(() => getWeekDays(today), [today]);
  const planned = useMemo(
    () => Object.fromEntries(days.map((day) => [day, tasks.filter((task) => !task.deleted && !task.completed && isPlannedOn(task, day))])),
    [days, tasks]
  );
  const selectedTasks = planned[selectedDay] ?? [];

  return (
    <div className="task-week">
      <div className="task-week-days">
        {days.map((day) => {
          const count = planned[day].length;
          const date = parseDateKey(day);
          return (
            <button
              className={day === selectedDay ? "task-week-day active" : "task-week-day"}
              key={day}
              type="button"
              aria-pressed={day === selectedDay}
              onClick={() => setSelectedDay(day)}
            >
              <small>{date.toLocaleDateString(locale, { weekday: "short" })}</small>
              <strong>{date.getDate()}</strong>
              <span aria-hidden="true">{count > 0 ? count : ""}</span>
            </button>
          );
        })}
      </div>
      {selectedTasks.length > 0 ? (
        <ul className="task-week-list">
          {selectedTasks.map((task) => (
            <li className={isCompletedOn(task.id, selectedDay, completions) ? "done" : ""} key={task.id}>
              <button type="button" onClick={() => onOpenTask(task.id)}>{task.title}</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
