"use client";

import { useEffect, useState } from "react";
import type { CoreSourcesSummary } from "@/lib/coreSources";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatPercent(value: number, locale: AppLocale): string {
  return `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} %`;
}

/**
 * Where Core came from: top-ups, % income kept in Core and rewards for actions, as a donut chart with
 * amounts and shares, plus the split of the action rewards. Read only.
 */
export default function CoreSourcesPanel({ locale, t }: { locale: AppLocale; t: TFunction }) {
  const [summary, setSummary] = useState<CoreSourcesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWithSupabaseAuth("/api/core/sources", { cache: "no-store" }, { authRequired: true })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as CoreSourcesSummary & { error?: string };
        if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed");
        if (!cancelled) setSummary(payload);
      })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError)); });
    return () => { cancelled = true; };
  }, []);

  const total = summary ? summary.parts.reduce((sum, part) => sum + part.amount, 0) : 0;
  let offset = 0;

  return (
    <section className="core-sources" aria-label={t("coreSources.title")}>
      <div className="core-sources-head">
        <strong>{t("coreSources.title")}</strong>
        <small>{t("coreSources.subtitle")}</small>
      </div>
      {summary === null && !error ? <p className="core-sources-empty">{t("coreSources.loading")}</p> : null}
      {summary && total <= 0 ? <p className="core-sources-empty">{t("coreSources.empty")}</p> : null}
      {summary && total > 0 ? (
        <>
          <div className="core-sources-body">
            <svg className="core-sources-chart" viewBox="0 0 100 100" role="img" aria-label={summary.parts.map((part) => `${t(`coreSources.${part.key}` as MessageKey)} ${formatPercent(part.percent, locale)}`).join(", ")}>
              <circle className="core-sources-track" cx="50" cy="50" r={RADIUS} />
              {summary.parts.filter((part) => part.amount > 0).map((part) => {
                const length = (part.amount / total) * CIRCUMFERENCE;
                const segment = (
                  <circle
                    key={part.key}
                    className={`core-sources-slice tone-${part.key}`}
                    cx="50"
                    cy="50"
                    r={RADIUS}
                    strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += length;
                return segment;
              })}
              <text x="50" y="47" className="core-sources-total-label">{t("coreSources.total")}</text>
              <text x="50" y="60" className="core-sources-total">{formatMoney(summary.balance, locale)}</text>
            </svg>
            <ul className="core-sources-legend">
              {summary.parts.map((part) => (
                <li key={part.key}>
                  <span className={`core-sources-dot tone-${part.key}`} aria-hidden="true" />
                  <span className="core-sources-name">{t(`coreSources.${part.key}` as MessageKey)}</span>
                  <span className="core-sources-amount">{formatMoney(part.amount, locale)}</span>
                  <span className="core-sources-percent">{formatPercent(part.percent, locale)}</span>
                </li>
              ))}
            </ul>
          </div>
          {summary.actions.length > 0 ? (
            <ul className="core-sources-actions" aria-label={t("coreSources.actions")}>
              {summary.actions.map((part) => (
                <li key={part.key}>
                  <span className="core-sources-name">{t(`coreSources.action.${part.key}` as MessageKey)}</span>
                  <span className="core-sources-amount">{formatMoney(part.amount, locale)}</span>
                  <span className="core-sources-percent">{formatPercent(part.percent, locale)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <small>{t("coreSources.note")}</small>
      {error ? <p className="finance-error">{error}</p> : null}
    </section>
  );
}
