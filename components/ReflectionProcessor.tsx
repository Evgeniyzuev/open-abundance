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
  type ReflectionGuidedDraft,
  type ReflectionGuidedSelections,
  type ReflectionGuidedStepId,
  type ReflectionProposal,
  type ReflectionStepResponse,
  type ReflectionTaskDraft
} from "@/lib/reflections";
import { trackProductEvent } from "@/lib/productAnalytics";

const PRIVACY_SEEN_KEY = "open-abundance:reflection-ai-privacy-seen:v1";
const GUIDED_STEPS: ReflectionGuidedStepId[] = ["feelings", "causes", "desiredChanges", "actions"];

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
  const [answers, setAnswers] = useState(processing.answers);
  const [guided, setGuided] = useState<ReflectionGuidedDraft | undefined>(processing.guided);
  const [customValue, setCustomValue] = useState("");
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
    await runStep(answers);
  }

  async function submitAnswer(value: string) {
    if (!question) return;
    const nextAnswer: ReflectionAnswer = {
      questionId: question.id,
      question: question.text,
      answer: value
    };
    const nextAnswers = [...answers, nextAnswer].slice(0, 2);
    setAnswers(nextAnswers);
    await updateReflectionProcessing(note.id, {
      ...processing,
      answers: nextAnswers,
      questionCount: nextAnswers.length,
      currentQuestion: undefined,
      guided,
      status: "clarifying",
      startedAt: processing.startedAt ?? new Date().toISOString()
    });
    setAnswer("");
    setQuestion(undefined);
    await runStep(nextAnswers, guided?.selections);
  }

  async function runStep(currentAnswers: ReflectionAnswer[], guidedSelections?: ReflectionGuidedSelections) {
    if (!navigator.onLine) {
      setError(t("reflections.offline"));
      return;
    }
    setLoading(true);
    setError(null);
    const guidedForStorage = guided
      ? { ...guided, selections: guidedSelections ?? guided.selections }
      : undefined;
    try {
      const response = await fetch("/api/ai/reflections/step", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: note.body, answers: currentAnswers, guided: guidedSelections, locale })
      });
      const rawPayload = await response.json().catch(() => null) as unknown;
      if (!response.ok || !isReflectionStepResponse(rawPayload)) {
        const message = isErrorPayload(rawPayload) ? rawPayload.error : t("reflections.aiError");
        throw new Error(message);
      }
      const payload: ReflectionStepResponse = rawPayload;

      if (payload.mode === "guided") {
        const nextGuided: ReflectionGuidedDraft = {
          suggestions: payload.suggestions,
          selections: emptyGuidedSelections(),
          currentStep: 0
        };
        setGuided(nextGuided);
        await updateReflectionProcessing(note.id, {
          ...processing,
          answers: currentAnswers,
          questionCount: currentAnswers.length,
          currentQuestion: undefined,
          guided: nextGuided,
          status: "clarifying",
          startedAt: processing.startedAt ?? new Date().toISOString()
        });
        trackProductEvent("reflection_guided_started");
      } else if (payload.mode === "question") {
        setQuestion(payload.question);
        await updateReflectionProcessing(note.id, {
          ...processing,
          answers: currentAnswers,
          questionCount: currentAnswers.length,
          currentQuestion: payload.question,
          guided: guidedForStorage,
          status: "clarifying",
          startedAt: processing.startedAt ?? new Date().toISOString()
        });
      } else if (payload.mode === "proposal") {
        setProposal(payload.proposal);
        setQuestion(undefined);
        await setReflectionProposal(note.id, payload.proposal);
        trackProductEvent("reflection_proposal_ready", { outcome: payload.proposal.outcomeKind, questions: currentAnswers.length });
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

  function toggleGuidedOption(stepId: ReflectionGuidedStepId, label: string, multiple: boolean) {
    setGuided((current) => {
      if (!current) return current;
      const selected = current.selections[stepId];
      const nextValues = multiple
        ? selected.includes(label) ? selected.filter((item) => item !== label) : [...selected, label]
        : [label];
      return { ...current, selections: { ...current.selections, [stepId]: nextValues } };
    });
  }

  async function advanceGuided() {
    if (!guided) return;
    const stepId = GUIDED_STEPS[Math.min(guided.currentStep, GUIDED_STEPS.length - 1)];
    const custom = customValue.trim();
    const isMultiple = stepId === "feelings" || stepId === "causes";
    const selected = guided.selections[stepId];
    const nextValues = custom
      ? isMultiple ? [...new Set([...selected, custom])].slice(0, 6) : [custom]
      : selected;
    const nextSelections = { ...guided.selections, [stepId]: nextValues };
    const isLast = guided.currentStep >= GUIDED_STEPS.length - 1;
    const nextGuided = { ...guided, selections: nextSelections, currentStep: isLast ? guided.currentStep : guided.currentStep + 1 };
    setGuided(nextGuided);
    setCustomValue("");
    await updateReflectionProcessing(note.id, {
      ...processing,
      answers,
      questionCount: answers.length,
      currentQuestion: undefined,
      guided: nextGuided,
      status: "clarifying",
      startedAt: processing.startedAt ?? new Date().toISOString()
    });
    if (isLast) await runStep(answers, nextSelections);
    else await onRefresh();
  }

  async function goBackGuided() {
    if (!guided || guided.currentStep <= 0) return;
    const nextGuided = { ...guided, currentStep: guided.currentStep - 1 };
    setGuided(nextGuided);
    setCustomValue("");
    await updateReflectionProcessing(note.id, { ...processing, answers, questionCount: answers.length, guided: nextGuided, status: "clarifying" });
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
    const description = [proposal.selfStatement, proposal.summary, proposal.ifThen, resources].filter(Boolean).join("\n\n");
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
            <section className="reflection-self-statement">
              <span>{t("reflections.selfStatement")}</span>
              <textarea aria-label={t("reflections.selfStatement")} value={proposal.selfStatement} onChange={(event) => setProposal({ ...proposal, selfStatement: event.target.value })} />
            </section>
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
            <span>{t("reflections.questionCounter", { count: Math.min(2, answers.length + 1) })}</span>
            <h3>{question.text}</h3>
            <textarea autoFocus value={answer} placeholder={t("reflections.answerPlaceholder")} onChange={(event) => setAnswer(event.target.value)} />
            <div className="reflection-final-actions">
              <button className="secondary-button" type="button" onClick={() => void submitAnswer(t("reflections.skippedAnswer"))}>{t("reflections.skip")}</button>
              <button className="task-done-primary-button" type="button" disabled={!answer.trim() || loading} onClick={() => void submitAnswer(answer.trim())}>{t("reflections.answer")}</button>
            </div>
          </div>
        ) : guided ? (
          <GuidedReflectionStep
            draft={guided}
            customValue={customValue}
            loading={loading}
            onBack={() => void goBackGuided()}
            onCustomChange={setCustomValue}
            onNext={() => void advanceGuided()}
            onToggle={toggleGuidedOption}
          />
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

        {loading && (question || proposal || guided) ? <div className="reflection-loading">{t("reflections.processing")}</div> : null}
        {error ? <div className="reflection-error" role="alert">{error}</div> : null}
      </section>
    </div>
  );
}

function GuidedReflectionStep({ draft, customValue, loading, onBack, onCustomChange, onNext, onToggle }: {
  draft: ReflectionGuidedDraft;
  customValue: string;
  loading: boolean;
  onBack: () => void;
  onCustomChange: (value: string) => void;
  onNext: () => void;
  onToggle: (stepId: ReflectionGuidedStepId, label: string, multiple: boolean) => void;
}) {
  const { t } = useUserContext();
  const stepIndex = Math.min(draft.currentStep, GUIDED_STEPS.length - 1);
  const stepId = GUIDED_STEPS[stepIndex];
  const multiple = stepId === "feelings" || stepId === "causes";
  const selected = draft.selections[stepId];

  return (
    <div className="reflection-guided">
      <div className="reflection-guided-progress" aria-label={t("reflections.guided.progress", { current: stepIndex + 1 })}>
        {GUIDED_STEPS.map((item, index) => <span className={index <= stepIndex ? "active" : ""} key={item} />)}
      </div>
      <span className="reflection-guided-counter">{t("reflections.guided.progress", { current: stepIndex + 1 })}</span>
      <h3>{t(`reflections.guided.${stepId}.title`)}</h3>
      <p>{t(`reflections.guided.${stepId}.description`)}</p>
      <div className="reflection-guided-options">
        {draft.suggestions[stepId].map((option) => (
          <label className={selected.includes(option.label) ? "selected" : ""} key={option.id}>
            <input
              type={multiple ? "checkbox" : "radio"}
              name={`reflection-${stepId}`}
              checked={selected.includes(option.label)}
              onChange={() => onToggle(stepId, option.label, multiple)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <label className="reflection-guided-custom">
        <span>{t("reflections.guided.custom")}</span>
        <input value={customValue} placeholder={t("reflections.guided.customPlaceholder")} onChange={(event) => onCustomChange(event.target.value)} />
      </label>
      <div className="reflection-guided-actions">
        {stepIndex > 0 ? <button className="text-button" type="button" disabled={loading} onClick={onBack}>{t("reflections.guided.back")}</button> : <span />}
        <button className="task-done-primary-button" type="button" disabled={loading} onClick={onNext}>
          {t(stepIndex === GUIDED_STEPS.length - 1 ? "reflections.guided.buildSummary" : "reflections.guided.next")}
        </button>
      </div>
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
  return value.mode === "guided" || value.mode === "question" || value.mode === "proposal" || value.mode === "safety";
}

function emptyGuidedSelections(): ReflectionGuidedSelections {
  return { feelings: [], causes: [], desiredChanges: [], actions: [] };
}

function isErrorPayload(value: unknown): value is { error: string } {
  return value !== null && typeof value === "object" && "error" in value && typeof value.error === "string";
}
