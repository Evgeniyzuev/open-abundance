"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import {
  activeDailySetCards,
  ADVENTURE_COUNT,
  buildDailySet,
  DAILY_SET_STORAGE_KEY,
  freshDailySetState,
  isDailySetFinished,
  pickDailyIndex,
  QUESTION_COUNT,
  recordDailySetStep,
  restoreDailySetState,
  type DailySetCardKind,
  type DailySetState
} from "@/lib/dailySet";
import { saveNote } from "@/lib/notesStore";
import { trackProductEvent } from "@/lib/productAnalytics";
import { getNextStep, isCompletedOn, isDueOn, todayKey } from "@/lib/taskSchedule";
import { getTaskCompletions, getTasks, saveTask, TASKS_CHANGED_EVENT, type TaskItem } from "@/lib/tasksStore";
import { celebrate } from "@/lib/ui/feedback";

type DailySetCardProps = {
  active: boolean;
  challenge: { id: string; title: string } | null;
  onOpenTask: (taskId: string) => void;
  onOpenChallenge: (challengeId: string) => void;
  onOpenFeed: () => void;
};

const TITLE_KEYS: Record<DailySetCardKind, MessageKey> = {
  task: "dailySet.task.title",
  adventure: "dailySet.adventure.title",
  challenge: "dailySet.challenge.title",
  question: "dailySet.question.title",
  stories: "dailySet.stories.title"
};

/**
 * A finite set of a few cards with one action each and a summary at the end.
 * Built only from data that is already on the device or already loaded by Home.
 */
export default function DailySetCard({ active, challenge, onOpenTask, onOpenChallenge, onOpenFeed }: DailySetCardProps) {
  const { t } = useUserContext();
  const day = todayKey();
  const [state, setState] = useState<DailySetState>(() => freshDailySetState(day));
  const [task, setTask] = useState<TaskItem | null>(null);
  const [answer, setAnswer] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      setState(restoreDailySetState(JSON.parse(window.localStorage.getItem(DAILY_SET_STORAGE_KEY) ?? "null"), day));
    } catch {
      setState(freshDailySetState(day));
    }
  }, [day]);

  useEffect(() => {
    if (!active) return;
    const load = async () => {
      try {
        const [tasks, completions] = await Promise.all([getTasks(), getTaskCompletions()]);
        setTask(tasks.find((item) => isDueOn(item, day) && !isCompletedOn(item.id, day, completions)) ?? null);
      } catch {
        setTask(null);
      }
    };
    void load();
    window.addEventListener(TASKS_CHANGED_EVENT, load);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, load);
  }, [active, day]);

  const builtCards = useMemo(() => buildDailySet({ hasTask: Boolean(task), hasChallenge: Boolean(challenge) }), [task, challenge]);
  const setCards = activeDailySetCards(state, builtCards);
  const finished = isDailySetFinished(state, setCards);
  const kind = setCards[state.index];
  const adventureKey = `adventure.${pickDailyIndex(day, ADVENTURE_COUNT)}` as MessageKey;
  const questionKey = `question.${pickDailyIndex(day, QUESTION_COUNT, 7)}` as MessageKey;

  function persist(next: DailySetState) {
    setState(next);
    try {
      window.localStorage.setItem(DAILY_SET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Progress lives for this screen only when storage is unavailable.
    }
  }

  function step(outcome: "action" | "skip") {
    if (!kind) return;
    const next = recordDailySetStep(state, kind, outcome, setCards);
    persist(next);
    trackProductEvent(outcome === "action" ? "daily_set_action" : "daily_set_skipped", { kind });
    if (outcome === "action") celebrate(cardRef.current);
    if (isDailySetFinished(next, setCards)) {
      trackProductEvent("daily_set_completed", { actions: next.actions, skips: next.skips, cards: setCards.length });
      setSummaryOpen(true);
    }
  }

  async function act() {
    if (kind === "task") {
      step("action");
      if (task) onOpenTask(task.id);
    } else if (kind === "adventure") {
      await saveTask({ id: crypto.randomUUID(), title: t(adventureKey), description: "", schedule: { type: "once", date: day }, syncStatus: "local" });
      step("action");
    } else if (kind === "challenge" && challenge) {
      step("action");
      onOpenChallenge(challenge.id);
    } else if (kind === "question") {
      if (!answer.trim()) return;
      await saveNote({ id: crypto.randomUUID(), title: t(questionKey), body: answer.trim(), syncStatus: "local" });
      setAnswer("");
      step("action");
    } else if (kind === "stories") {
      step("action");
      onOpenFeed();
    }
  }

  if (finished && !summaryOpen) {
    return (
      <button className="daily-set-done" type="button" onClick={() => setSummaryOpen(true)}>
        <CheckCircle2 size={17} aria-hidden="true" />
        <span>{t("dailySet.done")}</span>
        <small>{t("dailySet.summary.show")}</small>
      </button>
    );
  }

  if (finished) {
    return (
      <section className="home-card daily-set-card" ref={cardRef} aria-live="polite">
        <span className="home-card-label">{t("dailySet.title")}</span>
        <h2>{t("dailySet.summary.title")}</h2>
        <p>{t("dailySet.summary.counts", { actions: state.actions, skips: state.skips })}</p>
        <p className="daily-set-muted">{t("dailySet.summary.enough")}</p>
        <button className="text-button" type="button" onClick={() => setSummaryOpen(false)}>{t("app.common.close")}</button>
      </section>
    );
  }

  if (!kind) return null;

  return (
    <section className="home-card daily-set-card" ref={cardRef} aria-live="polite">
      <div className="daily-set-head">
        <span className="home-card-label">{t("dailySet.title")}</span>
        <span className="daily-set-progress" aria-label={t("dailySet.progress", { current: state.index + 1, total: setCards.length })}>
          {setCards.map((card, index) => <i key={card} className={index < state.index ? "done" : index === state.index ? "current" : ""} />)}
        </span>
      </div>
      <small className="daily-set-kind">{t(TITLE_KEYS[kind])}</small>
      {kind === "task" && task ? (
        <>
          <h2>{task.title}</h2>
          {getNextStep(task) ? <p>{t("tasks.steps.next", { step: getNextStep(task) as string })}</p> : null}
        </>
      ) : null}
      {kind === "task" && !task ? <h2>{t("dailySet.task.done")}</h2> : null}
      {kind === "adventure" ? <h2>{t(adventureKey)}</h2> : null}
      {kind === "challenge" && challenge ? <h2>{challenge.title}</h2> : null}
      {kind === "question" ? (
        <>
          <h2>{t(questionKey)}</h2>
          <textarea className="daily-set-answer" aria-label={t(questionKey)} placeholder={t("dailySet.question.placeholder")} rows={2} maxLength={1000} value={answer} onChange={(event) => setAnswer(event.target.value)} />
        </>
      ) : null}
      {kind === "stories" ? <h2>{t("dailySet.stories.body")}</h2> : null}
      <div className="daily-set-actions">
        <button className="challenge-primary-action home-primary-action" type="button" disabled={kind === "question" && !answer.trim()} onClick={() => void act()}>
          {t(`dailySet.${kind}.action` as MessageKey)}<ArrowRight size={17} />
        </button>
        <button className="text-button" type="button" onClick={() => step("skip")}>{t("dailySet.skip")}</button>
      </div>
    </section>
  );
}
