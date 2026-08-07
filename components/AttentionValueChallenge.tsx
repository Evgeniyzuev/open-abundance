"use client";

import { useMemo, useState } from "react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { calculateFutureCore } from "@/lib/coreCalculator";
import { useMoneyFormatter } from "@/components/UserProvider";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type AttentionValueChallengeProps = {
  locale: AppLocale;
  t: TFunction;
  onProof: (minutesPerDay: number, hourlyValueUsd: number) => Promise<void>;
  onPassedChange?: (passed: boolean) => void;
};

export default function AttentionValueChallenge({ locale, t, onProof, onPassedChange }: AttentionValueChallengeProps) {
  const money = useMoneyFormatter();
  const [minutesPerDay, setMinutesPerDay] = useState(60);
  const [hourlyValueUsd, setHourlyValueUsd] = useState(10);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const values = useMemo(() => {
    const dailyHours = minutesPerDay / 60;
    const dailyValue = dailyHours * hourlyValueUsd;
    const yearHours = dailyHours * 365;
    const yearValue = dailyValue * 365;
    const tenYearValue = yearValue * 10;
    const compoundScenario = calculateFutureCore({
      startCore: 0,
      dailyAdditions: dailyValue,
      reinvestPercent: 100,
      days: 3650
    });
    return { compoundScenario, dailyValue, tenYearValue, yearHours, yearValue };
  }, [hourlyValueUsd, minutesPerDay]);

  async function saveScenario() {
    setSaving(true);
    setError(null);
    try {
      await onProof(minutesPerDay, hourlyValueUsd);
      setSaved(true);
      onPassedChange?.(true);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : t("challenges.attention.saveFailed");
      setError(message);
      onPassedChange?.(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="attention-challenge">
      <div className="attention-challenge-heading">
        <span>{t("challenges.attention.eyebrow")}</span>
        <strong>{t("challenges.attention.personalScenario")}</strong>
      </div>

      <label className="challenge-field" htmlFor="attention-minutes">
        <span>{t("challenges.attention.minutesLabel")}</span>
        <strong>{minutesPerDay} {t("challenges.attention.minutesUnit")}</strong>
        <input
          id="attention-minutes"
          max={720}
          min={15}
          step={15}
          type="range"
          value={minutesPerDay}
          onChange={(event) => {
            setSaved(false);
            onPassedChange?.(false);
            setMinutesPerDay(Number(event.target.value));
          }}
        />
      </label>

      <label className="challenge-field" htmlFor="attention-hourly-value">
        <span>{t("challenges.attention.hourlyValueLabel")}</span>
        <div className="challenge-number-row">
          <input
            className="challenge-number-input"
            id="attention-hourly-value"
            inputMode="decimal"
            max={roundInputAmount(1000 * money.rate)}
            min={roundInputAmount(money.rate)}
            step={Math.max(0.01, roundInputAmount(money.rate))}
            type="number"
            value={roundInputAmount(hourlyValueUsd * money.rate)}
            onChange={(event) => {
              setSaved(false);
              onPassedChange?.(false);
              setHourlyValueUsd(Math.min(1000, Math.max(1, (Number(event.target.value) || money.rate) / money.rate)));
            }}
          />
          <span>{money.symbol} / {t("challenges.attention.hourUnit")}</span>
        </div>
      </label>

      <div className="attention-results">
        <div><span>{t("challenges.attention.yearHours")}</span><strong>{formatNumber(values.yearHours, locale)}</strong></div>
        <div><span>{t("challenges.attention.yearEstimate")}</span><strong>{money.formatRounded(values.yearValue)}</strong></div>
        <div><span>{t("challenges.attention.tenYearEstimate")}</span><strong>{money.formatRounded(values.tenYearValue)}</strong></div>
        <div><span>{t("challenges.attention.compoundScenario")}</span><strong>{money.formatRounded(values.compoundScenario)}</strong></div>
      </div>

      <p className="challenge-note">{t("challenges.attention.disclaimer")}</p>
      {error ? <p className="challenge-error">{error}</p> : null}
      <button className="challenge-primary-action" disabled={saving || saved} type="button" onClick={() => void saveScenario()}>
        {saved ? t("challenges.attention.saved") : saving ? t("app.common.loading") : t("challenges.attention.save")}
      </button>
    </section>
  );
}

function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 0 }).format(value);
}

function roundInputAmount(value: number): number {
  return Math.round(value * 100) / 100;
}
