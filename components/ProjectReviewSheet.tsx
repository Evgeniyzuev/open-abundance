"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { AI_TOOL_FAILURE_KEYS, postAiTool } from "@/lib/ai/toolClient";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { OPEN_AI_PROMPT_EVENT } from "@/lib/noteAiClient";
import { trackProductEvent } from "@/lib/productAnalytics";
import { saveTask } from "@/lib/tasksStore";
import { todayKey } from "@/lib/taskSchedule";
import {
  PROJECT_HOURS,
  PROJECT_STAGES,
  PROJECT_TEXT_MAX,
  normalizeProjectReview,
  projectChatPrompt,
  type ProjectAnswers,
  type ProjectReview
} from "@/lib/projectReview";

const STORE_PREFIX = "oa.projectReview.";

function readStored(wishId: string): { answers: ProjectAnswers; review: ProjectReview } | null {
  try {
    const raw = window.localStorage.getItem(`${STORE_PREFIX}${wishId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { answers: ProjectAnswers; review: unknown };
    const review = normalizeProjectReview(parsed.review);
    return review ? { answers: parsed.answers, review } : null;
  } catch {
    return null;
  }
}

function store(wishId: string, answers: ProjectAnswers, review: ProjectReview) {
  try {
    window.localStorage.setItem(`${STORE_PREFIX}${wishId}`, JSON.stringify({ answers, review }));
  } catch {
    // The review stays on screen; it simply won't be there next time.
  }
}

/**
 * "Project review from AI": five short answers, then Nova's review (strengths, risks, three first steps, how
 * Open Abundance can help). The steps can go into today's tasks, the first one can become the goal of the week,
 * and the chat with Nova continues from the review. The last review is kept on this device.
 */
export default function ProjectReviewSheet({ wishId, wishTitle, onClose }: { wishId: string; wishTitle: string; onClose: () => void }) {
  const { locale, t } = useUserContext();
  const saved = typeof window !== "undefined" ? readStored(wishId) : null;
  const [answers, setAnswers] = useState<ProjectAnswers>(saved?.answers ?? { idea: wishTitle, audience: "", stage: "idea", blocker: "", hours: "3-5" });
  const [review, setReview] = useState<ProjectReview | null>(saved?.review ?? null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [stepsAdded, setStepsAdded] = useState(false);
  const [goalSet, setGoalSet] = useState(false);

  async function requestReview() {
    setState("loading");
    setFailure(null);
    const result = await postAiTool("/api/ai/project-review", { answers, locale });
    const next = result.ok ? normalizeProjectReview((result.payload as { review?: unknown } | null)?.review) : null;
    if (!next) {
      setFailure(result.ok ? null : AI_TOOL_FAILURE_KEYS[result.reason] ?? null);
      setState("error");
      return;
    }
    setReview(next);
    store(wishId, answers, next);
    setState("idle");
  }

  async function addSteps() {
    if (!review) return;
    await saveTask({
      id: crypto.randomUUID(),
      title: t("wishes.stepsTaskTitle", { title: wishTitle }),
      description: "",
      subtasks: review.steps,
      schedule: { type: "once", date: todayKey() },
      syncStatus: "local"
    });
    setStepsAdded(true);
    trackProductEvent("project_review_steps_added", {});
  }

  async function makeWeekGoal() {
    if (!review?.steps[0]) return;
    const response = await fetchWithSupabaseAuth(
      "/api/lead-week",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "goal", goal: review.steps[0], wishId, visibility: "lead" }) },
      { authRequired: true }
    ).catch(() => null);
    if (response?.ok) {
      setGoalSet(true);
      trackProductEvent("project_review_week_goal", {});
    }
  }

  function discussWithNova() {
    if (!review) return;
    window.dispatchEvent(new CustomEvent(OPEN_AI_PROMPT_EVENT, { detail: { text: projectChatPrompt(review, locale) } }));
    onClose();
  }

  const field = (key: "idea" | "audience" | "blocker", label: MessageKey) => (
    <label className="finance-field">
      <span>{t(label)}</span>
      <textarea rows={2} maxLength={PROJECT_TEXT_MAX} value={answers[key]} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))} />
    </label>
  );

  return (
    <Sheet fullscreen className="project-review" title={t("projectReview.title")} closeLabel={t("app.common.close")} onClose={onClose}>
      {!review ? (
        <form
          className="project-review-form"
          onSubmit={(event) => {
            event.preventDefault();
            void requestReview();
          }}
        >
          <p>{t("projectReview.intro")}</p>
          {field("idea", "projectReview.q.idea")}
          {field("audience", "projectReview.q.audience")}
          <label className="finance-field">
            <span>{t("projectReview.q.stage")}</span>
            <select value={answers.stage} onChange={(event) => setAnswers((current) => ({ ...current, stage: event.target.value as ProjectAnswers["stage"] }))}>
              {PROJECT_STAGES.map((stage) => <option key={stage} value={stage}>{t(`projectReview.stage.${stage}` as MessageKey)}</option>)}
            </select>
          </label>
          {field("blocker", "projectReview.q.blocker")}
          <label className="finance-field">
            <span>{t("projectReview.q.hours")}</span>
            <select value={answers.hours} onChange={(event) => setAnswers((current) => ({ ...current, hours: event.target.value as ProjectAnswers["hours"] }))}>
              {PROJECT_HOURS.map((hours) => <option key={hours} value={hours}>{t("projectReview.hoursOption", { hours })}</option>)}
            </select>
          </label>
          {state === "error" ? <p className="finance-error inline">{failure ? t(failure) : t("projectReview.error")}</p> : null}
          <button className="task-done-primary-button" type="submit" disabled={state === "loading" || answers.idea.trim().length < 5}>
            {state === "loading" ? t("projectReview.loading") : t("projectReview.submit")}
          </button>
        </form>
      ) : (
        <div className="project-review-result">
          <p>{review.summary}</p>
          <h3>{t("projectReview.strengths")}</h3>
          <ul>{review.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
          <h3>{t("projectReview.risks")}</h3>
          <ul>{review.risks.map((item) => <li key={item}>{item}</li>)}</ul>
          <h3>{t("projectReview.steps")}</h3>
          <ol>{review.steps.map((item) => <li key={item}>{item}</li>)}</ol>
          {review.oaHelp ? (
            <>
              <h3>{t("projectReview.oaHelp")}</h3>
              <p>{review.oaHelp}</p>
            </>
          ) : null}
          <div className="wish-detail-actions">
            <button className="task-done-primary-button" type="button" onClick={discussWithNova}>{t("projectReview.discuss")}</button>
            <button className="secondary-button" type="button" disabled={goalSet} onClick={() => void makeWeekGoal()}>
              {goalSet ? t("projectReview.goalSet") : t("projectReview.makeGoal")}
            </button>
            <button className="secondary-button" type="button" disabled={stepsAdded} onClick={() => void addSteps()}>
              {stepsAdded ? t("home.help.taskAdded") : t("projectReview.addSteps")}
            </button>
            <button className="text-button" type="button" onClick={() => setReview(null)}>{t("projectReview.again")}</button>
          </div>
          <p className="wish-price-note">{t("projectReview.note")}</p>
        </div>
      )}
    </Sheet>
  );
}
