"use client";

import { useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

export type ChallengeQuizQuestion = {
  answerIndex: number;
  id: string;
  imageAltKey?: MessageKey;
  imageUrl?: string;
  optionKeys: MessageKey[];
  questionKey: MessageKey;
};

type ChallengeQuizProps = {
  passScore: number;
  questions: ChallengeQuizQuestion[];
  t: TFunction;
  onError?: (message: string) => void;
  onPass: (score: number) => Promise<void> | void;
  onPassedChange?: (passed: boolean) => void;
};

export default function ChallengeQuiz({ passScore, questions, t, onError, onPass, onPassedChange }: ChallengeQuizProps) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [passed, setPassed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentIndex];
  const score = getQuizScore(questions, answers);
  const answeredCurrent = currentAnswer !== undefined;
  const isLastQuestion = currentIndex >= questions.length - 1;
  const resultDots = questions.map((question, index) => {
    if (!submitted) return "○";
    return answers[index] === question.answerIndex ? "🟢" : "🔴";
  }).join("");

  useEffect(() => {
    setAnswers({});
    setCurrentIndex(0);
    setPassed(false);
    setSaving(false);
    setSubmitted(false);
    setSubmitError(null);
    onPassedChange?.(false);
  }, [onPassedChange, questions]);

  if (!currentQuestion) return null;

  function selectAnswer(answerIndex: number) {
    setSubmitError(null);
    setAnswers((current) => ({ ...current, [currentIndex]: answerIndex }));
  }

  function goPrevious() {
    setSubmitError(null);
    setCurrentIndex((value) => Math.max(0, value - 1));
  }

  function goNext() {
    setSubmitError(null);
    setCurrentIndex((value) => Math.min(questions.length - 1, value + 1));
  }

  function retry() {
    setAnswers({});
    setCurrentIndex(0);
    setPassed(false);
    setSaving(false);
    setSubmitted(false);
    setSubmitError(null);
    onPassedChange?.(false);
  }

  async function submit() {
    const nextScore = getQuizScore(questions, answers);
    const nextPassed = nextScore >= passScore;
    setSubmitted(true);
    setPassed(nextPassed);
    setSubmitError(null);
    onPassedChange?.(false);

    if (!nextPassed) return;

    setSaving(true);
    try {
      await onPass(nextScore);
      onPassedChange?.(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("challenges.quiz.recordFailed");
      setPassed(false);
      setSubmitError(message);
      onError?.(message);
      onPassedChange?.(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="challenge-quiz">
      <div className="challenge-quiz-head">
        <span>{t("challenges.quiz.title")}</span>
        <strong>{submitted ? `${score}/${questions.length}` : t("challenges.quiz.passRule")}</strong>
      </div>
      <p>{t("challenges.quiz.description")}</p>

      {submitted ? (
        <div className={passed ? "challenge-quiz-result passed" : "challenge-quiz-result"}>
          <span aria-label={t("challenges.quiz.result")}>{resultDots}</span>
          <strong>{passed ? t("challenges.quiz.passed") : t("challenges.quiz.failed")}</strong>
        </div>
      ) : (
        <fieldset className="challenge-quiz-question">
          <legend>
            <span>{t("challenges.quiz.step", { current: currentIndex + 1, total: questions.length })}</span>
            {t(currentQuestion.questionKey)}
          </legend>

          {currentQuestion.imageUrl ? (
            <div
              aria-label={currentQuestion.imageAltKey ? t(currentQuestion.imageAltKey) : undefined}
              className="challenge-quiz-image"
              role={currentQuestion.imageAltKey ? "img" : "presentation"}
              style={{ backgroundImage: `url(${currentQuestion.imageUrl})` }}
            />
          ) : null}

          <div className="challenge-quiz-options">
            {currentQuestion.optionKeys.map((option, answerIndex) => (
              <label key={option}>
                <input
                  checked={currentAnswer === answerIndex}
                  name={`challenge-quiz-${currentQuestion.id}`}
                  type="radio"
                  onChange={() => selectAnswer(answerIndex)}
                />
                <span>{t(option)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {submitError ? <p className="challenge-error">{submitError}</p> : null}

      <div className="challenge-quiz-actions">
        {submitted ? (
          <button className="challenge-secondary-action" type="button" onClick={retry}>{t("challenges.quiz.retry")}</button>
        ) : (
          <button className="challenge-secondary-action" type="button" disabled={currentIndex === 0 || saving} onClick={goPrevious}>
            {t("challenges.quiz.previous")}
          </button>
        )}

        {!submitted && !isLastQuestion ? (
          <button className="challenge-primary-action" type="button" disabled={!answeredCurrent || saving} onClick={goNext}>
            {t("challenges.quiz.next")}
          </button>
        ) : null}

        {!submitted && isLastQuestion ? (
          <button className="challenge-primary-action" type="button" disabled={!answeredCurrent || saving} onClick={submit}>
            {saving ? t("app.common.loading") : t("challenges.quiz.submit")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function getQuizScore(questions: ChallengeQuizQuestion[], answers: Record<number, number>): number {
  return questions.reduce((score, question, index) => score + (answers[index] === question.answerIndex ? 1 : 0), 0);
}
