"use client";

import { useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { AI_TOOL_FAILURE_KEYS, postAiTool, type AiToolFailure } from "@/lib/ai/toolClient";
import type { MessageKey } from "@/lib/i18n";
import { isRoutinePlan, MAX_ROUTINE_REQUEST, normalizeRoutinePlan, type RoutinePlan } from "@/lib/routinePlan";
import { addDays, todayKey } from "@/lib/taskSchedule";
import { saveTask } from "@/lib/tasksStore";
import { trackProductEvent } from "@/lib/productAnalytics";
import type { SafetyPayload } from "@/lib/ai/safety";

type RoutinePlanModalProps = {
  onClose: () => void;
};

type Status = "input" | "loading" | "ready" | "saving" | "error" | "offline";

const PRESET_KEYS = ["routine.preset.meals", "routine.preset.cleaning", "routine.preset.movement"] as const;

/**
 * Plans a week on explicit request. Confirmed days become ordinary one-time
 * tasks and the shopping list becomes the subtasks of one task.
 */
export default function RoutinePlanModal({ onClose }: RoutinePlanModalProps) {
  const { locale, t } = useUserContext();
  const [request, setRequest] = useState("");
  const [status, setStatus] = useState<Status>("input");
  const [failure, setFailure] = useState<AiToolFailure | null>(null);
  const [plan, setPlan] = useState<RoutinePlan | null>(null);
  const [skippedDays, setSkippedDays] = useState<Set<number>>(new Set());
  const [withShopping, setWithShopping] = useState(true);
  const [safety, setSafety] = useState<SafetyPayload | null>(null);

  async function build() {
    if (request.trim().length < 3 || status === "loading") return;
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    setStatus("loading");
    setFailure(null);
    setSafety(null);
    try {
      const aiResult = await postAiTool("/api/ai/routines/plan", { request, locale });
      if (!aiResult.ok) {
        setFailure(aiResult.reason);
        throw new Error(aiResult.reason);
      }
      const payload = aiResult.payload;
      if ((payload as { mode?: string } | null)?.mode === "safety") {
        setSafety(payload as SafetyPayload);
        setStatus("input");
        return;
      }
      if (!isRoutinePlan(payload)) throw new Error("plan_unavailable");
      const nextPlan = normalizeRoutinePlan(payload);
      if (!nextPlan) throw new Error("plan_invalid");
      setPlan(nextPlan);
      setSkippedDays(new Set());
      setWithShopping(nextPlan.shopping.length > 0);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  function toggleDay(offset: number) {
    setSkippedDays((current) => {
      const next = new Set(current);
      if (next.has(offset)) next.delete(offset);
      else next.add(offset);
      return next;
    });
  }

  async function create() {
    if (!plan || status === "saving") return;
    setStatus("saving");
    const today = todayKey();
    for (const day of plan.days.filter((entry) => !skippedDays.has(entry.offset))) {
      await saveTask({ id: crypto.randomUUID(), title: day.title, description: "", schedule: { type: "once", date: addDays(today, day.offset) }, syncStatus: "local" });
    }
    if (withShopping && plan.shopping.length > 0) {
      await saveTask({ id: crypto.randomUUID(), title: t("routine.shoppingTitle"), description: "", subtasks: plan.shopping, schedule: { type: "once", date: today }, syncStatus: "local" });
    }
    trackProductEvent("routine_plan_created", { days: plan.days.length - skippedDays.size, shopping: withShopping ? plan.shopping.length : 0 });
    onClose();
  }

  const showPlan = (status === "ready" || status === "saving") && plan;
  const createCount = plan ? plan.days.filter((day) => !skippedDays.has(day.offset)).length + (withShopping && plan.shopping.length > 0 ? 1 : 0) : 0;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet routine-modal">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("routine.title")}</h2>
          {showPlan ? (
            <button className="text-button primary" type="button" disabled={createCount === 0 || status === "saving"} onClick={create}>{t("braindump.create", { count: createCount })}</button>
          ) : <span />}
        </div>

        {showPlan ? (
          <div className="braindump-results">
            <section className="braindump-group">
              <ul className="step-suggestions">
                {plan.days.map((day) => (
                  <li key={day.offset}>
                    <label>
                      <input type="checkbox" checked={!skippedDays.has(day.offset)} onChange={() => toggleDay(day.offset)} />
                      <span>
                        <em>{new Date(Date.now() + day.offset * 86_400_000).toLocaleDateString(locale, { weekday: "short", day: "numeric" })} · </em>
                        {day.title}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
            {plan.shopping.length > 0 ? (
              <section className="braindump-group">
                <label className="routine-shopping-toggle">
                  <input type="checkbox" checked={withShopping} onChange={() => setWithShopping((value) => !value)} />
                  <span>{t("routine.shoppingTitle")} ({plan.shopping.length})</span>
                </label>
                <small>{plan.shopping.join(", ")}</small>
              </section>
            ) : null}
          </div>
        ) : (
          <>
            <div className="routine-presets">
              {PRESET_KEYS.map((key) => (
                <button className="subtask-chip" key={key} type="button" onClick={() => setRequest(t(key))}>{t(key)}</button>
              ))}
            </div>
            <textarea
              className="braindump-input"
              aria-label={t("routine.title")}
              autoFocus
              maxLength={MAX_ROUTINE_REQUEST}
              placeholder={t("routine.placeholder")}
              rows={4}
              value={request}
              onChange={(event) => setRequest(event.target.value)}
            />
            <button className="challenge-primary-action" type="button" disabled={request.trim().length < 3 || status === "loading"} onClick={build}>
              {status === "loading" ? t("routine.loading") : t("routine.build")}
            </button>
            {status === "error" ? <p className="step-suggest-note" role="status">{failure && AI_TOOL_FAILURE_KEYS[failure] ? t(AI_TOOL_FAILURE_KEYS[failure] as MessageKey) : t("routine.error")}</p> : null}
            {status === "offline" ? <p className="step-suggest-note" role="status">{t("routine.offline")}</p> : null}
            {safety ? (
              <div className="reflection-safety" role="alert">
                <h3>{safety.title}</h3>
                <p>{safety.message}</p>
                <ul>{safety.actions.map((action) => <li key={action}>{action}</li>)}</ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
