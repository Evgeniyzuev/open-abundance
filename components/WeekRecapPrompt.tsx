"use client";

import { useEffect, useState } from "react";
import { BarChart3, X } from "lucide-react";
import WeekRecapModal from "@/components/WeekRecapModal";
import { useUserContext } from "@/components/UserProvider";
import { getNotes } from "@/lib/notesStore";
import { todayKey } from "@/lib/taskSchedule";
import { getAllTasks, getTaskCompletions } from "@/lib/tasksStore";
import { computeWeekRecap, hasWeekActivity, isRecapPromptDay, recapWeekKey } from "@/lib/weekRecap";

const DISMISSED_KEY = "open-abundance:week-recap-dismissed";

/** A quiet Home line on Sunday and Monday when the past week had any activity. */
export default function WeekRecapPrompt({ active }: { active: boolean }) {
  const { t } = useUserContext();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const today = todayKey();
  const weekKey = recapWeekKey(today);

  useEffect(() => {
    if (!active || !isRecapPromptDay(today)) return;
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === weekKey) return;
    } catch {
      // Without storage the line may show again; it is dismissible.
    }
    void Promise.all([getAllTasks(), getTaskCompletions(), getNotes()])
      .then(([tasks, completions, notes]) => setVisible(hasWeekActivity(computeWeekRecap({ today, tasks, completions, notes }))))
      .catch(() => setVisible(false));
  }, [active, today, weekKey]);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, weekKey);
    } catch {
      // The line simply hides for this screen.
    }
  }

  return (
    <>
      {visible ? (
        <div className="week-recap-prompt">
          <button className="week-recap-prompt-open" type="button" onClick={() => { setOpen(true); dismiss(); }}>
            <BarChart3 size={17} aria-hidden="true" />
            <span>{t("weekRecap.prompt")}</span>
            <small>{t("weekRecap.promptOpen")}</small>
          </button>
          <button className="backup-reminder-close" type="button" aria-label={t("app.common.close")} onClick={dismiss}><X size={16} /></button>
        </div>
      ) : null}
      {open ? <WeekRecapModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
