"use client";

import { useState, type FormEvent } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { trackProductEvent } from "@/lib/productAnalytics";
import { addDays, daysBetween, todayKey } from "@/lib/taskSchedule";
import { saveTask } from "@/lib/tasksStore";
import { playUiSound } from "@/lib/ui/sound";

const FEELINGS = ["joy", "pride", "ease", "calm", "excitement"] as const;
const STEP_COUNT = 4;

/**
 * WOOP for a wish, one question per screen: the nearest result with a date, the feeling of a past
 * success, the likely obstacle and an if-then answer to it. The result is one ordinary local task
 * that keeps the plan, so the if-then line is in front of the person when they start.
 */
export default function WishWoopSheet({ wishId, wishTitle, onClose, onSaved }: { wishId: string; wishTitle: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useUserContext();
  const [step, setStep] = useState(0);
  const [result, setResult] = useState("");
  const [date, setDate] = useState(() => addDays(todayKey(), 7));
  const [feelings, setFeelings] = useState<string[]>([]);
  const [feelingNote, setFeelingNote] = useState("");
  const [obstacle, setObstacle] = useState("");
  const [ifCue, setIfCue] = useState("");
  const [thenAction, setThenAction] = useState("");
  const [saving, setSaving] = useState(false);

  const canContinue = step === 0 ? Boolean(result.trim() && date) : step === 2 ? Boolean(obstacle.trim()) : step === 3 ? Boolean(ifCue.trim() && thenAction.trim()) : true;

  function next() {
    // The if-part usually is the obstacle itself; start from it so the person only writes the answer.
    if (step === 2 && !ifCue.trim()) setIfCue(obstacle.trim());
    setStep((current) => Math.min(STEP_COUNT - 1, current + 1));
  }

  function toggleFeeling(feeling: string) {
    setFeelings((current) => (current.includes(feeling) ? current.filter((item) => item !== feeling) : [...current, feeling]));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < STEP_COUNT - 1) {
      if (canContinue) next();
      return;
    }
    if (!canContinue || saving) return;
    setSaving(true);
    const feeling = [...feelings.map((item) => t(`woop.feeling.${item}` as MessageKey)), feelingNote.trim()].filter(Boolean).join(", ");
    try {
      await saveTask({
        id: crypto.randomUUID(),
        title: result.trim(),
        description: t("woop.taskDescription", { title: wishTitle }),
        schedule: { type: "once", date },
        plan: { wishId, feeling: feeling || undefined, obstacle: obstacle.trim(), ifCue: ifCue.trim(), thenAction: thenAction.trim() },
        syncStatus: "local"
      });
      trackProductEvent("wish_woop_saved", { days: daysBetween(todayKey(), date), feeling: Boolean(feeling) });
      playUiSound("action");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet as="form" className="woop-sheet" closeLabel={t("app.common.close")} title={t("woop.title")} titleId="woop-title" onClose={onClose} onSubmit={submit}>
      <small className="woop-progress">{t("woop.progress", { step: step + 1, total: STEP_COUNT })}</small>
      {step === 0 ? (
        <>
          <label className="morning-field">
            <span>{t("woop.result.label")}</span>
            <textarea rows={2} maxLength={160} placeholder={t("woop.result.placeholder")} value={result} onChange={(event) => setResult(event.target.value)} />
          </label>
          <label className="morning-field">
            <span>{t("woop.date.label")}</span>
            <input type="date" min={todayKey()} value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </>
      ) : null}
      {step === 1 ? (
        <>
          <p className="woop-question">{t("woop.feeling.label")}</p>
          <div className="morning-contexts" role="group" aria-label={t("woop.feeling.label")}>
            <div>
              {FEELINGS.map((feeling) => (
                <button className={feelings.includes(feeling) ? "active" : ""} type="button" aria-pressed={feelings.includes(feeling)} key={feeling} onClick={() => toggleFeeling(feeling)}>
                  {t(`woop.feeling.${feeling}` as MessageKey)}
                </button>
              ))}
            </div>
          </div>
          <label className="morning-field">
            <span>{t("woop.feeling.note")}</span>
            <textarea rows={2} maxLength={200} value={feelingNote} onChange={(event) => setFeelingNote(event.target.value)} />
          </label>
        </>
      ) : null}
      {step === 2 ? (
        <label className="morning-field">
          <span>{t("woop.obstacle.label")}</span>
          <textarea rows={3} maxLength={200} placeholder={t("woop.obstacle.placeholder")} value={obstacle} onChange={(event) => setObstacle(event.target.value)} />
        </label>
      ) : null}
      {step === 3 ? (
        <>
          <label className="morning-field">
            <span>{t("woop.if.label")}</span>
            <textarea rows={2} maxLength={200} value={ifCue} onChange={(event) => setIfCue(event.target.value)} />
          </label>
          <label className="morning-field">
            <span>{t("woop.then.label")}</span>
            <textarea rows={2} maxLength={200} placeholder={t("woop.then.placeholder")} value={thenAction} onChange={(event) => setThenAction(event.target.value)} />
          </label>
        </>
      ) : null}
      <div className="woop-actions">
        {step > 0 ? <button className="secondary-button" type="button" onClick={() => setStep((current) => current - 1)}>{t("reflections.guided.back")}</button> : null}
        <button className="challenge-primary-action" type="submit" disabled={!canContinue || saving}>
          {step < STEP_COUNT - 1 ? t("reflections.guided.next") : t("woop.save")}
        </button>
      </div>
    </Sheet>
  );
}
