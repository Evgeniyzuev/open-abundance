"use client";

import { useEffect, useRef, useState } from "react";
import { ListChecks } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { AI_TOOL_FAILURE_KEYS, postAiTool, type AiToolFailure } from "@/lib/ai/toolClient";
import type { MessageKey } from "@/lib/i18n";
import { isTaskStepsResponse, MAX_TASK_SUBTASKS, normalizeStepSuggestions, type TaskStepSuggestion } from "@/lib/taskSteps";

type TaskStepSuggesterProps = {
  title: string;
  description: string;
  existingSteps: string[];
  onAccept: (steps: string[]) => void | Promise<void>;
  /** Requests steps as soon as the component appears (used after an explicit "help me start" tap). */
  autoStart?: boolean;
  onError?: (reason: AiToolFailure) => void;
};

type Status = "idle" | "loading" | "ready" | "error" | "offline";

/**
 * Asks AI for editable steps on explicit request. Nothing is saved or sent
 * until the person presses the button, and accepted steps become plain subtasks.
 */
export default function TaskStepSuggester({ title, description, existingSteps, onAccept, autoStart = false, onError }: TaskStepSuggesterProps) {
  const { locale, t } = useUserContext();
  const [status, setStatus] = useState<Status>("idle");
  const [failure, setFailure] = useState<AiToolFailure | null>(null);
  const [suggestions, setSuggestions] = useState<TaskStepSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const canAdd = existingSteps.length < MAX_TASK_SUBTASKS;
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void requestSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  async function requestSteps() {
    if (!title.trim() || status === "loading") return;
    if (!navigator.onLine) {
      setStatus("offline");
      onError?.("offline");
      return;
    }
    setStatus("loading");
    setFailure(null);
    try {
      const aiResult = await postAiTool("/api/ai/tasks/decompose", {
          title,
          description,
          existingSteps: [...existingSteps, ...suggestions.map((step) => step.text)],
          locale
        });
      if (!aiResult.ok) {
        setFailure(aiResult.reason);
        throw new Error(aiResult.reason);
      }
      const payload = aiResult.payload;
      if (!isTaskStepsResponse(payload)) throw new Error("steps_unavailable");
      const steps = normalizeStepSuggestions(payload.steps, existingSteps);
      if (steps.length === 0) throw new Error("steps_empty");
      setSuggestions(steps);
      setSelected(new Set(steps.map((_, index) => index)));
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      onError?.(error instanceof Error && ["signin", "quota", "offline"].includes(error.message) ? error.message as AiToolFailure : "error");
    }
  }

  async function acceptSelected() {
    const room = MAX_TASK_SUBTASKS - existingSteps.length;
    const steps = suggestions.filter((_, index) => selected.has(index)).map((step) => step.text).slice(0, Math.max(room, 0));
    if (steps.length === 0) return;
    await onAccept(steps);
    setSuggestions([]);
    setSelected(new Set());
    setStatus("idle");
  }

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="step-suggester">
      {status !== "ready" ? (
        <button className="secondary-button step-suggest-button" type="button" disabled={!title.trim() || status === "loading" || !canAdd} onClick={requestSteps}>
          <ListChecks size={16} /> {status === "loading" ? t("tasks.steps.loading") : t("tasks.steps.suggest")}
        </button>
      ) : (
        <>
          <ul className="step-suggestions">
            {suggestions.map((step, index) => (
              <li key={`${step.text}-${index}`}>
                <label>
                  <input type="checkbox" checked={selected.has(index)} onChange={() => toggle(index)} />
                  <span>
                    {index === 0 ? <em>{t("tasks.steps.startHere")} · </em> : null}
                    {step.text}
                    <small> {t("tasks.steps.minutes", { count: step.minutes })}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="step-suggest-actions">
            <button className="secondary-button" type="button" disabled={selected.size === 0} onClick={acceptSelected}>{t("tasks.steps.add")}</button>
            <button className="text-button" type="button" onClick={requestSteps}>{t("tasks.steps.retry")}</button>
          </div>
        </>
      )}
      {status === "error" ? <p className="step-suggest-note" role="status">{failure && AI_TOOL_FAILURE_KEYS[failure] ? t(AI_TOOL_FAILURE_KEYS[failure] as MessageKey) : t("tasks.steps.error")}</p> : null}
      {status === "offline" ? <p className="step-suggest-note" role="status">{t("tasks.steps.offline")}</p> : null}
    </div>
  );
}
