"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { computeCoreTicker, coreGrowthFactor } from "@/lib/coreTicker";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

const EXPANDED_KEY = "oa.coreTicker.expanded";

function money(value: number, decimals: number, locale: AppLocale): string {
  return `$${value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/**
 * Live view of the daily Core accrual: the amount that has built up since 00:00 UTC ticks up every
 * tenth of a second, down to millionths. It only displays what the accrual job will credit; it
 * changes no balance and no rate. Compact by default, a button opens the full counter.
 */
export default function CoreIncomeTicker({ balance, reinvestPercent, locale, t }: { balance: number; reinvestPercent: number; locale: AppLocale; t: TFunction }) {
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);
  const [pulse, setPulse] = useState(false);
  const previousBalance = useRef(balance);

  useEffect(() => {
    try {
      setExpanded(window.localStorage.getItem(EXPANDED_KEY) === "1");
    } catch {
      // Collapsed is a fine default when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const slow = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: number | undefined;
    const start = () => {
      window.clearInterval(timer);
      setNow(new Date());
      timer = window.setInterval(() => setNow(new Date()), slow ? 1000 : 100);
    };
    const onVisibility = () => (document.hidden ? window.clearInterval(timer) : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // A top-up or reinvestment makes the counter flare up for a moment.
  useEffect(() => {
    if (balance > previousBalance.current) {
      setPulse(true);
      const timer = window.setTimeout(() => setPulse(false), 1400);
      previousBalance.current = balance;
      return () => window.clearTimeout(timer);
    }
    previousBalance.current = balance;
  }, [balance]);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    try {
      window.localStorage.setItem(EXPANDED_KEY, next ? "1" : "0");
    } catch {
      // The choice then lasts until reload.
    }
  }

  const ticker = computeCoreTicker({ balance, reinvestPercent, now });
  const decimals = ticker.decimals;

  return (
    <section className={`core-ticker${pulse ? " is-pulsing" : ""}${expanded ? " is-open" : ""}`} aria-label={t("coreTicker.label")}>
      <button className="core-ticker-head" type="button" aria-expanded={expanded} onClick={toggle}>
        <span className="core-ticker-dot" aria-hidden="true" />
        <span className="core-ticker-label">{t("coreTicker.label")}</span>
        <strong className="core-ticker-value">+{money(ticker.today, decimals, locale)}</strong>
        <span className="core-ticker-toggle">{expanded ? t("coreTicker.hide") : t("coreTicker.show")}<ChevronDown size={16} aria-hidden="true" /></span>
      </button>
      {expanded ? (
        <div className="core-ticker-body">
          <div className="core-ticker-bar" role="img" aria-label={`${Math.round(ticker.dayProgress * 100)}%`}>
            <span style={{ width: `${(ticker.dayProgress * 100).toFixed(2)}%` }} />
          </div>
          <dl>
            <div><dt>{t("coreTicker.perSecond")}</dt><dd>{money(ticker.perSecond, Math.min(12, decimals + 1), locale)}</dd></div>
            <div><dt>{t("coreTicker.perDay")}</dt><dd>{money(ticker.perDay, 4, locale)}</dd></div>
            <div><dt>{t("coreTicker.toCore")}</dt><dd>{money(ticker.todayToCore, decimals, locale)}</dd></div>
            <div><dt>{t("coreTicker.toWallet")}</dt><dd>{money(ticker.todayToWallet, decimals, locale)}</dd></div>
          </dl>
          <small>{t("coreTicker.scenario", { factor: coreGrowthFactor(1).toFixed(2) })}</small>
          <small>{t("coreTicker.note")}</small>
        </div>
      ) : null}
    </section>
  );
}
