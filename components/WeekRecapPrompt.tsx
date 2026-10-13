"use client";

import { useEffect, useState } from "react";
import { BarChart3, X } from "lucide-react";
import WeekRecapModal from "@/components/WeekRecapModal";
import { useUserContext } from "@/components/UserProvider";
import { getNotes } from "@/lib/notesStore";
import { todayKey } from "@/lib/taskSchedule";
import { getAllTasks, getTaskCompletions } from "@/lib/tasksStore";
import { computeWeekRecap, daysSinceVisit, findOverdueTasks, hasWeekActivity, pickRecapPrompt, recapWeekKey } from "@/lib/weekRecap";

const DISMISSED_KEY = "open-abundance:week-recap-dismissed";
const LAST_HOME_VISIT_KEY = "open-abundance:last-home-visit";

/** A quiet Home line: the weekly recap on Sunday and Monday, or a gentle welcome back after a break. */
export default function WeekRecapPrompt({ active }: { active: boolean }) {
  const { t } = useUserContext();
  const [kind, setKind] = useState<"weekly" | "return" | null>(null);
  const [open, setOpen] = useState(false);
  const today = todayKey();
  const weekKey = recapWeekKey(today);

  useEffect(() => {
    if (!active) return;
    let lastVisit: string | null = null;
    let dismissed = false;
    try {
      lastVisit = window.localStorage.getItem(LAST_HOME_VISIT_KEY);
      window.localStorage.setItem(LAST_HOME_VISIT_KEY, today);
      dismissed = window.localStorage.getItem(DISMISSED_KEY) === weekKey;
    } catch {
      // Without storage the line may show again; it is dismissible.
    }
    if (dismissed) return;
    void Promise.all([getAllTasks(), getTaskCompletions(), getNotes()])
      .then(([tasks, completions, notes]) => setKind(pickRecapPrompt({
        today,
        hasActivity: hasWeekActivity(computeWeekRecap({ today, tasks, completions, notes })),
        overdueCount: findOverdueTasks(tasks, today).length,
        daysSinceVisit: daysSinceVisit(lastVisit, today)
      })))
      .catch(() => setKind(null));
    // The visit is recorded once per Home activation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function dismiss() {
    setKind(null);
    try {
      window.localStorage.setItem(DISMISSED_KEY, weekKey);
    } catch {
      // The line simply hides for this screen.
    }
  }

  return (
    <>
      {kind ? (
        <div className="week-recap-prompt">
          <button className="week-recap-prompt-open" type="button" onClick={() => { setOpen(true); dismiss(); }}>
            <BarChart3 size={17} aria-hidden="true" />
            <span>{kind === "return" ? t("weekRecap.welcomeBack") : t("weekRecap.prompt")}</span>
            <small>{t("weekRecap.promptOpen")}</small>
          </button>
          <button className="backup-reminder-close" type="button" aria-label={t("app.common.close")} onClick={dismiss}><X size={16} /></button>
        </div>
      ) : null}
      {open ? <WeekRecapModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
