"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import {
  closeReflection,
  setReflectionFeedback,
  setReflectionProposal,
  updateReflectionProcessing,
  type Note
} from "@/lib/notesStore";
import {
  getReflectionPractice,
  REFLECTION_PRACTICES,
  type ReflectionAnswer,
  type ReflectionFeedback,
  type ReflectionProposal,
  type ReflectionStepResponse,
  type ReflectionTaskDraft
} from "@/lib/reflections";
import { trackProductEvent } from "@/lib/productAnalytics";

const PRIVACY_SEEN_KEY = "open-abundance:reflection-ai-privacy-seen:v1";

type ReflectionProcessorProps = {
  note: Note;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSchedule: (draft: ReflectionTaskDraft) => void;
};

export default function ReflectionProcessor({ note, onClose, onRefresh, onSchedule }: ReflectionProcessorProps) {
  const { locale, t } = useUserContext();
  const processing = note.processing!;
  const [question, setQuestion] = useState(processing?.currentQuestion);
  const [answer, setAnswer] = useState("");
  const [proposal, setProposal] = useState<ReflectionProposal | undefined>(processing?.proposal);
  const [safety, setSafety] = useState<Extract<ReflectionStepResponse, { mode: "safety" }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remindAt, setRemindAt] = useState(defaultReminderDateTime());
  const practice = useMemo(() => proposal ? getReflectionPractice(proposal.practiceId) : null, [proposal]);

  async function startProcessing() {
    if (typeof window !== "undefined" && localStorage.getItem(PRIVACY_SEEN_KEY) !== "1") {
      const accepted = window.confirm(t("reflections.privacyConfirm"));
      if (!accepted) return;
      localStorage.setItem(PRIVACY_SEEN_KEY, "1");
    }
    trackProductEvent("reflection_processing_started", { status: processing.status });
    await runStep(processing.answers);
  }

  async function submitAnswer(value: string) {
    if (!question) return;
    const nextAnswer: ReflectionAnswer = {
      questionId: question.id,
      question: question.text,
      answer: value
    };
    const answers = [...processing.answers, nextAnswer].slice(0, 3);
    await updateReflectionProcessing(note.id, {
      ...processing,
      answers,
      questionCount: answers.length,
      currentQuestion: undefined,
      status: "clarifying",
      startedAt: processing.startedAt ?? new Date().toISOString()
    });
    setAnswer("");
    setQuestion(undefined);
    await runStep(answers);
  }

  async function runStep(answers: ReflectionAnswer[]) {
    if (!navigator.onLine) {
      setError(t("reflections.offline"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/reflections/step", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: note.body, answers, locale })
      });
      const rawPayload = await response.json().catch(() => null) as unknown;
      if (!response.ok || !isReflectionStepResponse(rawPayload)) {
        const message = isErrorPayload(rawPayload) ? rawPayload.error : t("reflections.aiError");
        throw new Error(message);
      }
      const payload: ReflectionStepResponse = rawPayload;

      if (payload.mode === "question") {
        setQuestion(payload.question);
        await updateReflectionProcessing(note.id, {
          ...processing,
          answers,
          questionCount: answers.length,
          currentQuestion: payload.question,
          status: "clarifying",
          startedAt: processing.startedAt ?? new Date().toISOString()
        });
      } else if (payload.mode === "proposal") {
        setProposal(payload.proposal);
        setQuestion(undefined);
        await setReflectionProposal(note.id, payload.proposal);
        trackProductEvent("reflection_proposal_ready", { outcome: payload.proposal.outcomeKind, questions: answers.length });
      } else {
        setSafety(payload);
        setQuestion(undefined);
        trackProductEvent("reflection_safety_shown");
      }
      await onRefresh();
    } catch (stepError) {
      setError(stepError instanceof Error ? stepError.message : t("reflections.aiError"));
    } finally {
      setLoading(false);
    }
  }

  async function persistProposal() {
    if (!proposal) return;
    await setReflectionProposal(note.id, proposal);
  }

  async function closeProcessor() {
    await persistProposal();
    await onRefresh();
    onClose();
  }

  async function finishWithoutTask() {
    await persistProposal();
    await closeReflection(note.id);
    trackProductEvent("reflection_closed", { withTask: false, outcome: proposal?.outcomeKind ?? "none" });
    await onRefresh();
    onClose();
  }

  async function scheduleTask() {
    if (!proposal) return;
    await persistProposal();
    const resources = [
      proposal.resourcesHave.length ? `${t("reflections.resourcesHave")}: ${proposal.resourcesHave.join("; ")}` : "",
      proposal.resourcesNeed.length ? `${t("reflections.resourcesNeed")}: ${proposal.resourcesNeed.join("; ")}` : "",
      proposal.resourcesObtain.length ? `${t("reflections.resourcesObtain")}: ${proposal.resourcesObtain.join("; ")}` : ""
    ].filter(Boolean).join("\n");
    const description = [proposal.summary, proposal.ifThen, resources].filter(Boolean).join("\n\n");
    const parsedReminder = remindAt ? new Date(remindAt) : null;
    onSchedule({
      sourceNoteId: note.id,
      title: proposal.nextAction,
      description,
      remindAt: parsedReminder && !Number.isNaN(parsedReminder.getTime()) ? parsedReminder.toISOString() : undefined,
      nonce: Date.now()
    });
  }

  async function saveFeedback(feedback: ReflectionFeedback) {
    await setReflectionFeedback(note.id, feedback);
    trackProductEvent("reflection_feedback", { feedback });
    await onRefresh();
    onClose();
  }

  return (
    <div className="modal-backdrop reflection-backdrop" role="presentation">
      <section className="modal-sheet reflection-processor" aria-label={t("reflections.processTitle")}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={() => void closeProcessor()}>{t("app.common.close")}</button>
          <h2>{t("reflections.processTitle")}</h2>
          <span />
        </div>

        <div className="reflection-original">
          <span>{t("reflections.original")}</span>
          <p>{note.body}</p>
        </div>

        {processing.status === "closed" ? (
          <div className="reflection-feedback">
            <h3>{t("reflections.feedbackTitle")}</h3>
            <div className="reflection-inline-actions">
              {(["yes", "partly", "no"] as ReflectionFeedback[]).map((value) => (
                <button className={processing.feedback === value ? "secondary-button active" : "secondary-button"} key={value} type="button" onClick={() => void saveFeedback(value)}>
                  {t(`reflections.feedback.${value}`)}
                </button>
              ))}
            </div>
          </div>
        ) : safety ? (
          <div className="reflection-safety" role="alert">
            <h3>{safety.title}</h3>
            <p>{safety.message}</p>
            <ul>{safety.actions.map((action) => <li key={action}>{action}</li>)}</ul>
          </div>
        ) : proposal ? (
          <div className="reflection-result">
            <EditableText label={t("reflections.summary")} value={proposal.summary} onChange={(summary) => setProposal({ ...proposal, summary })} />
            <EditableArray label={t("reflections.facts")} value={proposal.facts} onChange={(facts) => setProposal({ ...proposal, facts })} />
            <EditableArray label={t("reflections.thoughts")} value={proposal.thoughts} onChange={(thoughts) => setProposal({ ...proposal, thoughts })} />
            <EditableArray label={t("reflections.feelings")} value={proposal.feelings} onChange={(feelings) => setProposal({ ...proposal, feelings })} />
            <EditableArray label={t("reflections.bodySignals")} value={proposal.bodySignals} onChange={(bodySignals) => setProposal({ ...proposal, bodySignals })} />
            <EditableArray label={t("reflections.reactions")} value={proposal.reactions} onChange={(reactions) => setProposal({ ...proposal, reactions })} />
            <EditableText label={t("reflections.desiredOutcome")} value={proposal.desiredOutcome} onChange={(desiredOutcome) => setProposal({ ...proposal, desiredOutcome })} />

            <section className="reflection-section">
              <h3>{t("reflections.causes")}</h3>
              {proposal.causes.map((cause, index) => (
                <label className="reflection-cause" key={cause.id}>
                  <input
                    type="checkbox"
                    checked={cause.confirmed}
                    onChange={(event) => setProposal({
                      ...proposal,
                      causes: proposal.causes.map((item, causeIndex) => causeIndex === index ? { ...item, confirmed: event.target.checked } : item)
                    })}
                  />
                  <span>
                    <input aria-label={t("reflections.causeText")} value={cause.text} onChange={(event) => setProposal({ ...proposal, causes: proposal.causes.map((item, causeIndex) => causeIndex === index ? { ...item, text: event.target.value } : item) })} />
                    <textarea aria-label={t("reflections.causeRationale")} value={cause.rationale} onChange={(event) => setProposal({ ...proposal, causes: proposal.causes.map((item, causeIndex) => causeIndex === index ? { ...item, rationale: event.target.value } : item) })} />
                  </span>
                </label>
              ))}
            </section>

            <section className="reflection-section">
              <h3>{t("reflections.alternatives")}</h3>
              {proposal.alternatives.map((alternative, index) => (
                <div className="reflection-alternative" key={`${index}-${alternative.title}`}>
                  <input aria-label={t("reflections.alternativeTitle")} value={alternative.title} onChange={(event) => setProposal({ ...proposal, alternatives: proposal.alternatives.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} />
                  <textarea aria-label={t("reflections.alternativeDescription")} value={alternative.description} onChange={(event) => setProposal({ ...proposal, alternatives: proposal.alternatives.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })} />
                </div>
              ))}
            </section>

            {practice ? (
              <div className="reflection-practice-choice">
                <label><span>{t("reflections.practice")}</span><select value={proposal.practiceId} onChange={(event) => setProposal({ ...proposal, practiceId: event.target.value as ReflectionProposal["practiceId"] })}>{REFLECTION_PRACTICES.map((item) => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}</select></label>
                <a className="reflection-practice" href={practice.sourceUrl} target="_blank" rel="noreferrer">
                  <span><strong>{practice.title[locale]}</strong><small>{practice.description[locale]}</small></span>
                  <ExternalLink size={17} />
                </a>
              </div>
            ) : null}

            <EditableArray label={t("reflections.resourcesHave")} value={proposal.resourcesHave} onChange={(resourcesHave) => setProposal({ ...proposal, resourcesHave })} />
            <EditableArray label={t("reflections.resourcesNeed")} value={proposal.resourcesNeed} onChange={(resourcesNeed) => setProposal({ ...proposal, resourcesNeed })} />
            <EditableArray label={t("reflections.resourcesObtain")} value={proposal.resourcesObtain} onChange={(resourcesObtain) => setProposal({ ...proposal, resourcesObtain })} />
            <label className="reflection-editable"><span>{t("reflections.outcome")}</span><select value={proposal.outcomeKind} onChange={(event) => setProposal({ ...proposal, outcomeKind: event.target.value as ReflectionProposal["outcomeKind"] })}>
              {(["act_now", "wait", "accept", "learn", "ask_human"] as const).map((value) => <option key={value} value={value}>{t(`reflections.outcome.${value}`)}</option>)}
            </select></label>
            {proposal.humanRecommendation ? <EditableText label={t("reflections.humanRecommendation")} value={proposal.humanRecommendation} onChange={(humanRecommendation) => setProposal({ ...proposal, humanRecommendation })} /> : null}
            <EditableText label={t("reflections.nextAction")} value={proposal.nextAction} onChange={(nextAction) => setProposal({ ...proposal, nextAction })} />
            <EditableText label={t("reflections.ifThen")} value={proposal.ifThen} onChange={(ifThen) => setProposal({ ...proposal, ifThen })} />

            <label className="reflection-reminder-field">
              <span>{t("reflections.when")}</span>
              <input type="datetime-local" value={remindAt} onChange={(event) => setRemindAt(event.target.value)} />
            </label>

            <div className="reflection-final-actions">
              <button className="secondary-button" type="button" onClick={() => void finishWithoutTask()}>{t("reflections.closeWithoutTask")}</button>
              <button className="task-done-primary-button" type="button" disabled={!proposal.nextAction.trim()} onClick={() => void scheduleTask()}>{t("reflections.schedule")}</button>
            </div>
          </div>
        ) : question ? (
          <div className="reflection-question">
            <span>{t("reflections.questionCounter", { count: Math.min(3, processing.answers.length + 1) })}</span>
            <h3>{question.text}</h3>
            <textarea autoFocus value={answer} placeholder={t("reflections.answerPlaceholder")} onChange={(event) => setAnswer(event.target.value)} />
            <div className="reflection-final-actions">
              <button className="secondary-button" type="button" onClick={() => void submitAnswer(t("reflections.skippedAnswer"))}>{t("reflections.skip")}</button>
              <button className="task-done-primary-button" type="button" disabled={!answer.trim() || loading} onClick={() => void submitAnswer(answer.trim())}>{t("reflections.answer")}</button>
            </div>
          </div>
        ) : (
          <div className="reflection-start">
            <Sparkles size={32} />
            <p>{t("reflections.startDescription")}</p>
            <button className="task-done-primary-button" type="button" disabled={loading} onClick={() => void startProcessing()}>
              {loading ? t("reflections.processing") : t("reflections.start")}
            </button>
            <button className="text-button" type="button" onClick={() => void finishWithoutTask()}>{t("reflections.closeWithoutTask")}</button>
          </div>
        )}

        {loading && (question || proposal) ? <div className="reflection-loading">{t("reflections.processing")}</div> : null}
        {error ? <div className="reflection-error" role="alert">{error}</div> : null}
      </section>
    </div>
  );
}

function EditableArray({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <label className="reflection-editable">
      <span>{label}</span>
      <textarea value={value.join("\n")} placeholder="—" onChange={(event) => onChange(event.target.value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 8))} />
    </label>
  );
}

function EditableText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="reflection-editable">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function defaultReminderDateTime(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function isReflectionStepResponse(value: unknown): value is ReflectionStepResponse {
  if (!value || typeof value !== "object" || !("mode" in value)) return false;
  return value.mode === "question" || value.mode === "proposal" || value.mode === "safety";
}

function isErrorPayload(value: unknown): value is { error: string } {
  return value !== null && typeof value === "object" && "error" in value && typeof value.error === "string";
}
