"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { isDecisionResult, MAX_DECISION_CONTEXT_LENGTH, MAX_DECISION_OPTIONS, MAX_DECISION_OPTION_LENGTH, MIN_DECISION_OPTIONS, normalizeDecision, type DecisionResult } from "@/lib/decision";
import { todayKey } from "@/lib/taskSchedule";
import { saveTask } from "@/lib/tasksStore";
import type { SafetyPayload } from "@/lib/ai/safety";

export type DecisionOption = {
  text: string;
  /** Set when the option is an existing local task, so no duplicate task is created. */
  taskId?: string;
};

type DecisionModalProps = {
  initialOptions: DecisionOption[];
  onClose: () => void;
  onOpenTask?: (taskId: string) => void;
};

type Status = "input" | "loading" | "ready" | "error" | "offline";

/**
 * Picks one of two to four options on explicit request. Options are sent only
 * after the press and nothing is stored unless the person adds the pick as a task.
 */
export default function DecisionModal({ initialOptions, onClose, onOpenTask }: DecisionModalProps) {
  const { locale, t } = useUserContext();
  const [options, setOptions] = useState<DecisionOption[]>(() => {
    const seeded = initialOptions.slice(0, MAX_DECISION_OPTIONS);
    while (seeded.length < MIN_DECISION_OPTIONS) seeded.push({ text: "" });
    return seeded;
  });
  const [context, setContext] = useState("");
  const [status, setStatus] = useState<Status>("input");
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [safety, setSafety] = useState<SafetyPayload | null>(null);
  const filled = options.filter((option) => option.text.trim());

  function setOptionText(index: number, text: string) {
    setOptions((current) => current.map((option, position) => (position === index ? { text } : option)));
  }

  async function choose() {
    if (filled.length < MIN_DECISION_OPTIONS || status === "loading") return;
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    setStatus("loading");
    setSafety(null);
    try {
      const response = await fetch("/api/ai/decisions/choose", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options: filled.map((option) => option.text), context, locale })
      });
      const payload = await response.json().catch(() => null) as unknown;
      if (response.ok && (payload as { mode?: string } | null)?.mode === "safety") {
        setSafety(payload as SafetyPayload);
        setStatus("input");
        return;
      }
      if (!response.ok || !isDecisionResult(payload)) throw new Error("decision_unavailable");
      const decision = normalizeDecision(payload, filled.length);
      if (!decision) throw new Error("decision_invalid");
      setResult(decision);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  async function addAsTask(option: DecisionOption, firstStep: string) {
    await saveTask({
      id: crypto.randomUUID(),
      title: option.text.trim(),
      description: "",
      subtasks: firstStep ? [firstStep] : [],
      schedule: { type: "once", date: todayKey() },
      syncStatus: "local"
    });
    onClose();
  }

  const chosen = result ? filled[result.choice] : undefined;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet decision-modal">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
          <h2>{t("decision.title")}</h2>
          <span />
        </div>

        {status === "ready" && result && chosen ? (
          <div className="decision-result" role="status">
            <strong>{chosen.text}</strong>
            <p>{result.reason}</p>
            {result.firstStep ? <p><em>{t("decision.firstStep")}</em> {result.firstStep}</p> : null}
            {chosen.taskId && onOpenTask ? (
              <button className="challenge-primary-action" type="button" onClick={() => { onOpenTask(chosen.taskId as string); onClose(); }}>{t("decision.openTask")}</button>
            ) : (
              <button className="challenge-primary-action" type="button" onClick={() => void addAsTask(chosen, result.firstStep)}>{t("decision.addTask")}</button>
            )}
            <button className="text-button" type="button" onClick={() => setStatus("input")}>{t("decision.again")}</button>
          </div>
        ) : (
          <>
            {options.map((option, index) => (
              <input
                className="decision-input"
                key={index}
                aria-label={t("decision.option", { number: index + 1 })}
                maxLength={MAX_DECISION_OPTION_LENGTH}
                placeholder={t("decision.option", { number: index + 1 })}
                value={option.text}
                onChange={(event) => setOptionText(index, event.target.value)}
              />
            ))}
            {options.length < MAX_DECISION_OPTIONS ? (
              <button className="secondary-button" type="button" aria-label={t("decision.addOption")} onClick={() => setOptions((current) => [...current, { text: "" }])}><Plus size={16} /></button>
            ) : null}
            <input
              className="decision-input"
              aria-label={t("decision.context")}
              maxLength={MAX_DECISION_CONTEXT_LENGTH}
              placeholder={t("decision.context")}
              value={context}
              onChange={(event) => setContext(event.target.value)}
            />
            <button className="challenge-primary-action" type="button" disabled={filled.length < MIN_DECISION_OPTIONS || status === "loading"} onClick={choose}>
              {status === "loading" ? t("decision.loading") : t("decision.choose")}
            </button>
            {status === "error" ? <p className="step-suggest-note" role="status">{t("decision.error")}</p> : null}
            {status === "offline" ? <p className="step-suggest-note" role="status">{t("decision.offline")}</p> : null}
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
