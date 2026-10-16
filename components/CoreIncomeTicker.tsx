"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { computeCoreTicker, coreGrowthPercent, dropsFallen, dropUnit } from "@/lib/coreTicker";

const GROWTH_YEARS = [1, 3, 10, 30] as const;
const GLASS_BOTTOM = 84;
const GLASS_HEIGHT = 70;

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
  const [drops, setDrops] = useState<number[]>([]);
  const previousBalance = useRef(balance);
  const previousDrops = useRef<number | null>(null);
  const dropId = useRef(0);

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

  const ticker = computeCoreTicker({ balance, reinvestPercent, now });
  const decimals = ticker.decimals;
  const unit = dropUnit(ticker.perSecond);
  const fallen = dropsFallen(ticker.today, unit);

  // Each time another unit of income has built up, one drop falls into the glass.
  useEffect(() => {
    const previous = previousDrops.current;
    previousDrops.current = fallen;
    if (previous === null || fallen <= previous) return;
    const id = ++dropId.current;
    setDrops((current) => [...current.slice(-2), id]);
    const timer = window.setTimeout(() => setDrops((current) => current.filter((value) => value !== id)), 1100);
    return () => window.clearTimeout(timer);
  }, [fallen]);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    try {
      window.localStorage.setItem(EXPANDED_KEY, next ? "1" : "0");
    } catch {
      // The choice then lasts until reload.
    }
  }

  const waterY = GLASS_BOTTOM - GLASS_HEIGHT * ticker.dayProgress;

  return (
    <section className={`core-ticker${pulse ? " is-pulsing" : ""}${expanded ? " is-open" : ""}`} aria-label={t("coreTicker.label")}>
      <button className="core-ticker-head" type="button" aria-expanded={expanded} onClick={toggle}>
        <span className={`core-ticker-dot${drops.length ? " is-dripping" : ""}`} aria-hidden="true" />
        <span className="core-ticker-label">{t("coreTicker.label")}</span>
        <strong className="core-ticker-value">+{money(ticker.today, decimals, locale)}</strong>
        <span className="core-ticker-toggle">{expanded ? t("coreTicker.hide") : t("coreTicker.show")}<ChevronDown size={16} aria-hidden="true" /></span>
      </button>
      {expanded ? (
        <div className="core-ticker-body">
          <div className="core-ticker-main">
            <svg className="core-ticker-glass" viewBox="0 0 60 90" role="img" aria-label={t("coreTicker.glass")}>
              <defs>
                <clipPath id="core-glass-clip"><path d="M10 14 L14 80 Q14 84 18 84 H42 Q46 84 46 80 L50 14 Z" /></clipPath>
              </defs>
              <g clipPath="url(#core-glass-clip)">
                <rect className="core-ticker-water" x="0" y={waterY} width="60" height={90 - waterY} />
              </g>
              <path className="core-ticker-glass-line" d="M10 14 L14 80 Q14 84 18 84 H42 Q46 84 46 80 L50 14" />
              {drops.map((id) => (
                <path className="core-drop" key={id} style={{ "--fall": `${Math.max(8, waterY - 8)}px` } as React.CSSProperties} d="M30 -4 C30 -4 26 2 26 5 A4 4 0 0 0 34 5 C34 2 30 -4 30 -4 Z" />
              ))}
            </svg>
            <dl>
              <div><dt>{t("coreTicker.perSecond")}</dt><dd>{money(ticker.perSecond, Math.min(12, decimals + 1), locale)}</dd></div>
              <div><dt>{t("coreTicker.perDay")}</dt><dd>{money(ticker.perDay, 4, locale)}</dd></div>
              <div><dt>{t("coreTicker.toCore")}</dt><dd>{money(ticker.todayToCore, decimals, locale)}</dd></div>
              <div><dt>{t("coreTicker.toWallet")}</dt><dd>{money(ticker.todayToWallet, decimals, locale)}</dd></div>
            </dl>
          </div>
          <small>{unit > 0 ? `${t("coreTicker.drop", { amount: money(unit, Math.min(12, Math.max(2, -Math.floor(Math.log10(unit)))), locale) })}. ` : ""}{t("coreTicker.glass")}.</small>
          <div className="core-ticker-growth">
            <span>{t("coreTicker.growth")}</span>
            <ul>
              {GROWTH_YEARS.map((years) => (
                <li key={years}><b>{t(`coreTicker.y${years}` as MessageKey)}</b><span>+{Math.round(coreGrowthPercent(years)).toLocaleString(locale)} %</span></li>
              ))}
            </ul>
          </div>
          <small>{t("coreTicker.note")}</small>
        </div>
      ) : null}
    </section>
  );
}
