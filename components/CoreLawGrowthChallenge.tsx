"use client";

import { useMemo, useState } from "react";
import ChallengeQuiz, { type ChallengeQuizQuestion } from "@/components/ChallengeQuiz";
import { calculateFutureCore, DAILY_CORE_RATE } from "@/lib/coreCalculator";
import type { AppLocale, MessageKey } from "@/lib/i18n";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type CoreLawGrowthChallengeProps = {
  locale: AppLocale;
  t: TFunction;
  onProof: (score: number) => Promise<void>;
  onPassedChange?: (passed: boolean) => void;
};

const CONTENT_SCREEN_COUNT = 3;
const GROWTH_YEARS = [0, 10, 20, 30];

const QUESTIONS: ChallengeQuizQuestion[] = [
  {
    answerIndex: 0,
    id: "core-cannot-reduce",
    optionKeys: ["challenges.coreQuiz.q1.a", "challenges.coreQuiz.q1.b", "challenges.coreQuiz.q1.c"],
    questionKey: "challenges.coreQuiz.q1"
  },
  {
    answerIndex: 1,
    id: "one-dollar-fifty-years",
    optionKeys: ["challenges.coreQuiz.q2.a", "challenges.coreQuiz.q2.b", "challenges.coreQuiz.q2.c"],
    questionKey: "challenges.coreQuiz.q2"
  },
  {
    answerIndex: 1,
    id: "reinvest-growth",
    optionKeys: ["challenges.coreQuiz.q3.a", "challenges.coreQuiz.q3.b", "challenges.coreQuiz.q3.c"],
    questionKey: "challenges.coreQuiz.q3"
  },
  {
    answerIndex: 2,
    id: "thirty-year-core",
    optionKeys: ["challenges.coreQuiz.q4.a", "challenges.coreQuiz.q4.b", "challenges.coreQuiz.q4.c"],
    questionKey: "challenges.coreQuiz.q4"
  },
  {
    answerIndex: 0,
    id: "scenario-limits",
    optionKeys: ["challenges.coreQuiz.q5.a", "challenges.coreQuiz.q5.b", "challenges.coreQuiz.q5.c"],
    questionKey: "challenges.coreQuiz.q5"
  }
];

export default function CoreLawGrowthChallenge({ locale, t, onProof, onPassedChange }: CoreLawGrowthChallengeProps) {
  const [screen, setScreen] = useState(0);
  const growthRows = useMemo(() => GROWTH_YEARS.map((year) => ({
    base: calculateFutureCore({ startCore: 1000, dailyAdditions: 0, reinvestPercent: 100, days: Math.round(year * 365.25) }),
    challenge: calculateFutureCore({ startCore: 1000, dailyAdditions: 10, reinvestPercent: 100, days: Math.round(year * 365.25) }),
    year
  })), []);
  const chartMax = growthRows[growthRows.length - 1]?.challenge ?? 1;
  const chartLines = growthRows.map((row, index) => ({
    baseY: 154 - (row.base / chartMax) * 126,
    challengeY: 154 - (row.challenge / chartMax) * 126,
    x: 14 + (index / Math.max(1, growthRows.length - 1)) * 272
  }));

  function nextScreen() {
    setScreen((value) => Math.min(CONTENT_SCREEN_COUNT, value + 1));
  }

  function previousScreen() {
    setScreen((value) => Math.max(0, value - 1));
  }

  return (
    <section className="core-law-challenge">
      <div className="core-growth-progress" aria-label={t("challenges.coreGrowth.progress", { current: Math.min(screen + 1, CONTENT_SCREEN_COUNT), total: CONTENT_SCREEN_COUNT })}>
        <div className="core-growth-progress-track">
          <span style={{ width: `${(Math.min(screen, CONTENT_SCREEN_COUNT - 1) + 1) / CONTENT_SCREEN_COUNT * 100}%` }} />
        </div>
        <small>{screen < CONTENT_SCREEN_COUNT ? t("challenges.coreGrowth.progress", { current: screen + 1, total: CONTENT_SCREEN_COUNT }) : t("challenges.coreGrowth.quizProgress")}</small>
      </div>

      {screen === 0 ? (
        <>
          <div className="core-growth-screen-heading">
            <span>{t("challenges.coreGrowth.screen1.eyebrow")}</span>
            <strong>{t("challenges.coreGrowth.screen1.title")}</strong>
          </div>
          <p className="core-growth-lead">{t("challenges.coreGrowth.screen1.body")}</p>
          <div className="core-law-signals">
            <div><strong>Core</strong><span>{t("challenges.coreGrowth.screen1.signal1")}</span></div>
            <div><strong>24/7</strong><span>{t("challenges.coreGrowth.screen1.signal2")}</span></div>
            <div><strong>∞</strong><span>{t("challenges.coreGrowth.screen1.signal3")}</span></div>
          </div>
          <ScreenActions onNext={nextScreen} nextLabel={t("challenges.coreGrowth.screen1.next")} />
        </>
      ) : null}

      {screen === 1 ? (
        <>
          <div className="core-growth-screen-heading">
            <span>{t("challenges.coreGrowth.screen2.eyebrow")}</span>
            <strong>{t("challenges.coreGrowth.screen2.title")}</strong>
          </div>
          <p className="core-growth-lead">{t("challenges.coreGrowth.screen2.body")}</p>
          <div className="core-growth-dollar-card">
            <div><span>{t("challenges.coreGrowth.screen2.oneYear")}</span><strong>{formatMoney(365, locale)}</strong></div>
            <div><span>{t("challenges.coreGrowth.screen2.fiftyYears")}</span><strong>{formatMoney(18250, locale)}</strong></div>
          </div>
          <p className="challenge-note">{t("challenges.coreGrowth.screen2.note")}</p>
          <ScreenActions backLabel={t("challenges.quiz.previous")} onBack={previousScreen} onNext={nextScreen} nextLabel={t("challenges.coreGrowth.screen2.next")} />
        </>
      ) : null}

      {screen === 2 ? (
        <>
          <div className="core-growth-screen-heading">
            <span>{t("challenges.coreGrowth.screen3.eyebrow")}</span>
            <strong>{t("challenges.coreGrowth.screen3.title")}</strong>
          </div>
          <p className="core-growth-lead">{t("challenges.coreGrowth.screen3.body")}</p>
          <svg className="core-growth-chart" role="img" aria-label={t("challenges.coreGrowth.chartAria")} viewBox="0 0 300 170">
            <line className="core-growth-axis" x1="14" x2="286" y1="154" y2="154" />
            <polyline className="core-growth-line" points={chartLines.map((point) => `${point.x},${point.baseY}`).join(" ")} />
            <polyline className="core-growth-line core-growth-line-secondary" points={chartLines.map((point) => `${point.x},${point.challengeY}`).join(" ")} />
          </svg>
          <div className="core-growth-legend">
            <span><i className="core-growth-legend-dot" />{t("challenges.coreGrowth.legend.base")}</span>
            <span><i className="core-growth-legend-dot secondary" />{t("challenges.coreGrowth.legend.challenge")}</span>
          </div>
          <div className="core-growth-table-wrap">
            <table className="core-growth-table">
              <thead>
                <tr>
                  <th>{t("challenges.coreGrowth.table.year")}</th>
                  <th>{t("challenges.coreGrowth.table.base")}</th>
                  <th>{t("challenges.coreGrowth.table.challenge")}</th>
                </tr>
              </thead>
              <tbody>
                {growthRows.map((row) => (
                  <tr key={row.year}>
                    <th>{row.year}</th>
                    <td>{formatMoney(row.base, locale)}</td>
                    <td>{formatMoney(row.challenge, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="challenge-note">{t("challenges.coreGrowth.screen3.note", { rate: `${(DAILY_CORE_RATE * 100).toFixed(4)}%` })}</p>
          <ScreenActions backLabel={t("challenges.quiz.previous")} onBack={previousScreen} onNext={nextScreen} nextLabel={t("challenges.coreGrowth.screen3.next")} />
        </>
      ) : null}

      {screen === CONTENT_SCREEN_COUNT ? (
        <>
          <div className="core-growth-screen-heading">
            <span>{t("challenges.coreGrowth.quizEyebrow")}</span>
            <strong>{t("challenges.coreGrowth.quizTitle")}</strong>
          </div>
          <ChallengeQuiz
            descriptionKey="challenges.coreQuiz.description"
            onError={() => undefined}
            onPass={onProof}
            onPassedChange={onPassedChange}
            passScore={4}
            passRuleKey="challenges.coreQuiz.passRule"
            questions={QUESTIONS}
            t={t}
          />
          <ScreenActions backLabel={t("challenges.quiz.previous")} onBack={previousScreen} />
        </>
      ) : null}
    </section>
  );
}

type ScreenActionsProps = {
  backLabel?: string;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
};

function ScreenActions({ backLabel, onBack, onNext, nextLabel }: ScreenActionsProps) {
  return (
    <div className="core-growth-actions">
      {onBack ? <button aria-label={backLabel} className="challenge-secondary-action" type="button" onClick={onBack}>←</button> : <span />}
      {onNext ? <button className="challenge-primary-action" type="button" onClick={onNext}>{nextLabel}</button> : null}
    </div>
  );
}

function formatMoney(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 0 }).format(value)} $`;
}
