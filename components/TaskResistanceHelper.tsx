"use client";

import { useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { trackProductEvent } from "@/lib/productAnalytics";
import { prependTaskSubtask } from "@/lib/tasksStore";

const REASONS = ["unclear", "big", "fear", "boring"] as const;
type Reason = (typeof REASONS)[number];

/**
 * "I don't feel like starting": the person names what makes the task unpleasant, gets one way to
 * make it lighter and can put that easy step first. Aversiveness, not the reward, is what usually
 * blocks the start.
 */
export default function TaskResistanceHelper({ taskId, onChanged }: { taskId: string; onChanged: () => Promise<void> | void }) {
  const { t } = useUserContext();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [added, setAdded] = useState(false);

  async function addStep(current: Reason) {
    await prependTaskSubtask(taskId, t(`resistance.${current}.step` as MessageKey));
    trackProductEvent("task_resistance_step_added", { reason: current });
    setAdded(true);
    await onChanged();
  }

  if (!open) {
    return <button className="text-button task-resistance-open" type="button" onClick={() => setOpen(true)}>{t("resistance.open")}</button>;
  }

  return (
    <section className="task-resistance" aria-label={t("resistance.open")}>
      <p className="woop-question">{t("resistance.question")}</p>
      <div className="morning-contexts" role="group" aria-label={t("resistance.question")}>
        <div>
          {REASONS.map((item) => (
            <button className={reason === item ? "active" : ""} type="button" aria-pressed={reason === item} key={item} onClick={() => { setReason(item); setAdded(false); }}>
              {t(`resistance.${item}.label` as MessageKey)}
            </button>
          ))}
        </div>
      </div>
      {reason ? (
        <>
          <p>{t(`resistance.${reason}.tip` as MessageKey)}</p>
          {added
            ? <p className="wish-steps-added" role="status">{t("resistance.added")}</p>
            : <button className="secondary-button" type="button" onClick={() => void addStep(reason)}>{t("resistance.addStep", { step: t(`resistance.${reason}.step` as MessageKey) })}</button>}
        </>
      ) : null}
    </section>
  );
}
