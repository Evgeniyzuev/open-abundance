"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { daysBetween, todayKey } from "@/lib/taskSchedule";
import { getAllTasks, getTaskCompletions, TASKS_CHANGED_EVENT } from "@/lib/tasksStore";

const DISMISS_KEY = "oa.comeback.dismissed";
const GAP_DAYS = 3;
const RECENT_WINS = 3;

type Wins = { doneDays: number; finished: number; recent: string[] };

/**
 * After a break, Home offers a fresh starting point instead of a broken streak: the past does not
 * count against the person, and what already worked is listed as support for new expectations.
 */
export default function HomeComebackCard({ active, onOpenTasks }: { active: boolean; onOpenTasks: () => void }) {
  const { t } = useUserContext();
  const [wins, setWins] = useState<Wins | null>(null);

  const load = useCallback(async () => {
    const day = todayKey();
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === day) {
        setWins(null);
        return;
      }
    } catch {
      // Without storage the card can reappear on reload.
    }
    try {
      const [tasks, completions] = await Promise.all([getAllTasks(), getTaskCompletions()]);
      const done = completions.filter((completion) => completion.type === "done").sort((left, right) => right.completedAt.localeCompare(left.completedAt));
      const last = done[0];
      if (!last || last.localDate >= day || daysBetween(last.localDate, day) < GAP_DAYS) {
        setWins(null);
        return;
      }
      const titles = new Map(tasks.map((task) => [task.id, task.title]));
      const recent = [...new Set(done.map((completion) => titles.get(completion.taskId)).filter((title): title is string => Boolean(title)))].slice(0, RECENT_WINS);
      setWins({ doneDays: done.length, finished: tasks.filter((task) => task.completed && !task.deleted).length, recent });
    } catch {
      setWins(null);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
    window.addEventListener(TASKS_CHANGED_EVENT, load);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, load);
  }, [active, load]);

  if (!wins) return null;

  function start() {
    try {
      window.localStorage.setItem(DISMISS_KEY, todayKey());
    } catch {
      // The card then hides only until the next load.
    }
    setWins(null);
    onOpenTasks();
  }

  return (
    <section className="home-card home-comeback-card">
      <span className="home-card-label">{t("comeback.label")}</span>
      <h2>{t("comeback.title")}</h2>
      <p>{t("comeback.wins", { days: wins.doneDays, finished: wins.finished })}</p>
      {wins.recent.length ? (
        <ul>
          {wins.recent.map((title) => <li key={title}>{title}</li>)}
        </ul>
      ) : null}
      <button className="challenge-primary-action" type="button" onClick={start}>{t("comeback.start")}</button>
    </section>
  );
}
