"use client";

import { useMemo } from "react";
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

const QUESTIONS: ChallengeQuizQuestion[] = [
  {
    answerIndex: 0,
    id: "core-cannot-reduce",
    optionKeys: ["challenges.coreQuiz.q1.a", "challenges.coreQuiz.q1.b", "challenges.coreQuiz.q1.c"],
    questionKey: "challenges.coreQuiz.q1"
  },
  {
    answerIndex: 1,
    id: "core-growth-scenario",
    optionKeys: ["challenges.coreQuiz.q2.a", "challenges.coreQuiz.q2.b", "challenges.coreQuiz.q2.c"],
    questionKey: "challenges.coreQuiz.q2"
  },
  {
    answerIndex: 0,
    id: "core-ordinary-checkin",
    optionKeys: ["challenges.coreQuiz.q3.a", "challenges.coreQuiz.q3.b", "challenges.coreQuiz.q3.c"],
    questionKey: "challenges.coreQuiz.q3"
  }
];

export default function CoreLawGrowthChallenge({ locale, t, onProof, onPassedChange }: CoreLawGrowthChallengeProps) {
  const points = useMemo(() => [0, 1, 5, 10, 20, 30].map((year) => ({
    amount: calculateFutureCore({ startCore: 10, dailyAdditions: 0, reinvestPercent: 100, days: Math.round(year * 365.25) }),
    year
  })), []);
  const maxAmount = points[points.length - 1]?.amount ?? 1;
  const chartPoints = points.map((point, index) => {
    const x = 12 + (index / Math.max(1, points.length - 1)) * 276;
    const y = 158 - (point.amount / maxAmount) * 132;
    return { ...point, x, y };
  });

  return (
    <section className="core-law-challenge">
      <div className="core-growth-chart-heading">
        <span>{t("challenges.coreGrowth.eyebrow")}</span>
        <strong>{t("challenges.coreGrowth.title")}</strong>
      </div>
      <svg className="core-growth-chart" role="img" aria-label={t("challenges.coreGrowth.chartAria")} viewBox="0 0 300 180">
        <line className="core-growth-axis" x1="12" x2="288" y1="158" y2="158" />
        <polyline className="core-growth-line" points={chartPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
        {chartPoints.map((point) => <circle className="core-growth-point" cx={point.x} cy={point.y} key={point.year} r="3" />)}
      </svg>
      <div className="core-growth-labels">
        {chartPoints.map((point) => <span key={point.year}><strong>{point.year}</strong><small>{formatMoney(point.amount, locale)}</small></span>)}
      </div>
      <p className="challenge-note">{t("challenges.coreGrowth.disclaimer", { rate: `${(DAILY_CORE_RATE * 100).toFixed(4)}%` })}</p>
      <ChallengeQuiz
        descriptionKey="challenges.coreQuiz.description"
        onError={() => undefined}
        onPass={onProof}
        onPassedChange={onPassedChange}
        passScore={3}
        passRuleKey="challenges.coreQuiz.passRule"
        questions={QUESTIONS}
        t={t}
      />
    </section>
  );
}

function formatMoney(value: number, locale: AppLocale): string {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 0 }).format(value)} $`;
}
