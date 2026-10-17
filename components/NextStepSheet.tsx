"use client";

import { useState, type FormEvent } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import { trackProductEvent } from "@/lib/productAnalytics";
import { addDays, todayKey } from "@/lib/taskSchedule";
import { saveTask, type TaskItem } from "@/lib/tasksStore";

/**
 * Shown right after a task is done: the person leaves themselves a hook for tomorrow (Hemingway's
 * "stop when you know what comes next"). The answer becomes a one-time task for tomorrow that Home
 * shows first as "Continue".
 */
export default function NextStepSheet({ task, onClose }: { task: TaskItem; onClose: () => void }) {
  const { t } = useUserContext();
  const [nextStep, setNextStep] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nextStep.trim() || saving) return;
    setSaving(true);
    try {
      await saveTask({
        id: crypto.randomUUID(),
        title: nextStep.trim(),
        description: "",
        schedule: { type: "once", date: addDays(todayKey(), 1) },
        continueFrom: task.id,
        plan: task.plan,
        syncStatus: "local"
      });
      trackProductEvent("task_next_hook_saved", { schedule: task.schedule.type });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet as="form" className="woop-sheet" closeLabel={t("app.common.close")} title={t("nextHook.title", { title: task.title })} titleId="next-hook-title" onClose={onClose} onSubmit={submit}>
      {task.plan?.feeling ? <p className="woop-question">{t("nextHook.feeling", { feeling: task.plan.feeling })}</p> : null}
      <label className="morning-field">
        <span>{t("nextHook.label")}</span>
        <textarea rows={2} maxLength={160} placeholder={t("nextHook.placeholder")} value={nextStep} onChange={(event) => setNextStep(event.target.value)} />
      </label>
      <div className="woop-actions">
        <button className="secondary-button" type="button" onClick={onClose}>{t("reflections.skip")}</button>
        <button className="challenge-primary-action" type="submit" disabled={!nextStep.trim() || saving}>{t("nextHook.save")}</button>
      </div>
    </Sheet>
  );
}
