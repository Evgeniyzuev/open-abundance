"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import RealityVideoButton from "@/components/RealityVideoButton";
import { realityCalendar, realitySeries, summarizeReality, type RealityDay, type RealityMetric } from "@/lib/realityTimeline";

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;
type Tab = "chart" | "calendar";

const PERIODS: Array<[number, MessageKey]> = [[7, "reality.period.week"], [30, "reality.period.month"], [90, "reality.period.quarter"], [0, "reality.period.all"]];
const METRICS: Array<[RealityMetric, MessageKey]> = [["turnover", "social.post.turnover"], ["coreGrowth", "social.post.totalCoreGrowth"], ["level", "social.post.level"]];
const STORY_MS = 5000;

/** An author's reality: headline numbers, stories by day, a chart and a calendar. Hidden when there are no days. */
export default function RealityView({ userId, locale, t, isOwner = false }: { userId: string; locale: AppLocale; t: Translate; isOwner?: boolean }) {
  const [days, setDays] = useState<RealityDay[] | null>(null);
  const [tab, setTab] = useState<Tab>("chart");
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/reality/${userId}?ts=${Date.now()}`, { cache: "no-store" });
        const payload = await response.json() as { days?: RealityDay[]; error?: string };
        if (!response.ok || payload.error) throw new Error(payload.error ?? "Reality unavailable");
        if (!cancelled) setDays(payload.days ?? []);
      } catch {
        if (!cancelled) setDays([]);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (!days?.length) return null;
  const summary = summarizeReality(days, today);
  const money = (value: number) => formatAdaptiveMoney(value, locale);

  return (
    <section className="reality-view" aria-label={t("reality.title")}>
      <div className="reality-view-head">
        <button className="reality-story-ring" type="button" onClick={() => setStoryIndex(Math.max(0, days.length - 7))} aria-label={t("reality.watch")}>
          <Play size={18} aria-hidden="true" />
        </button>
        <div className="reality-kpis">
          <span>
            <strong>{summary.levelStart !== null && summary.level !== null && summary.levelStart !== summary.level ? `${summary.levelStart} → ${summary.level}` : `Lvl ${summary.level ?? 0}`}</strong>
            <small>{summary.firstDate ? t("reality.since", { date: formatShortDate(summary.firstDate, locale) }) : t("social.post.level")}</small>
          </span>
          {summary.hasTurnover ? <span><strong>+{money(summary.turnover30)}</strong><small>{t("reality.turnover30")}</small></span> : null}
          <span><strong>{summary.activeDays}</strong><small>{t("reality.days")}</small></span>
        </div>
      </div>

      <div className="reality-tabs" role="group" aria-label={t("reality.title")}>
        <button type="button" aria-pressed={tab === "chart"} className={tab === "chart" ? "active" : ""} onClick={() => setTab("chart")}>{t("reality.tab.chart")}</button>
        <button type="button" aria-pressed={tab === "calendar"} className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}>{t("reality.tab.calendar")}</button>
      </div>

      {tab === "chart" ? <RealityChart days={days} today={today} locale={locale} t={t} /> : null}
      {tab === "calendar" ? (
        <RealityCalendar days={days} today={today} locale={locale} t={t} onOpen={(day) => setStoryIndex(days.findIndex((item) => item.postId === day.postId))} />
      ) : null}

      {isOwner ? <RealityVideoButton userId={userId} /> : null}

      {storyIndex !== null && storyIndex >= 0 ? (
        <StoryPlayer days={days} startIndex={storyIndex} locale={locale} t={t} onClose={() => setStoryIndex(null)} />
      ) : null}
    </section>
  );
}

function RealityChart({ days, today, locale, t }: { days: RealityDay[]; today: string; locale: AppLocale; t: Translate }) {
  const available = METRICS.filter(([metric]) => days.some((day) => day[metric] !== null));
  const [period, setPeriod] = useState(30);
  // Start on the metric with the most points in the default period, so the first view is a line, not a dot.
  const [metric, setMetric] = useState<RealityMetric>(() => available
    .map(([key]) => [key, realitySeries(days, key, 30, today).length] as const)
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? "level");
  const [hover, setHover] = useState<number | null>(null);
  const points = useMemo(() => realitySeries(days, metric, period, today), [days, metric, period, today]);
  const width = 600;
  const height = 180;
  const pad = { top: 12, right: 12, bottom: 22, left: 12 };

  const format = (value: number) => metric === "level" ? `Lvl ${value}` : formatAdaptiveMoney(value, locale);
  const values = points.map((point) => point.value);
  const max = Math.max(...values, metric === "level" ? 1 : 0);
  const min = metric === "level" ? Math.min(...values, max) - 1 : 0;
  const x = (index: number) => pad.left + (points.length <= 1 ? (width - pad.left - pad.right) / 2 : (index / (points.length - 1)) * (width - pad.left - pad.right));
  const y = (value: number) => pad.top + (max === min ? 0.5 : 1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(x(index) - relative) < Math.abs(x(nearest) - relative)) nearest = index;
    }
    setHover(nearest);
  }

  const active = hover !== null ? points[hover] : points.at(-1);

  return (
    <div className="reality-chart">
      <div className="reality-chart-controls">
        <div className="reality-segment" role="group" aria-label={t("reality.metric")}>
          {available.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={metric === key} className={metric === key ? "active" : ""} onClick={() => { setMetric(key); setHover(null); }}>{t(label)}</button>
          ))}
        </div>
        <div className="reality-segment" role="group" aria-label={t("reality.period")}>
          {PERIODS.map(([days, label]) => (
            <button key={days} type="button" aria-pressed={period === days} className={period === days ? "active" : ""} onClick={() => { setPeriod(days); setHover(null); }}>{t(label)}</button>
          ))}
        </div>
      </div>
      {points.length ? (
        <>
          <p className="reality-chart-value" aria-live="polite">
            <strong>{active ? format(active.value) : ""}</strong>
            <small>{active ? formatShortDate(active.date, locale) : ""}</small>
          </p>
          <svg
            className="reality-chart-svg"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={t(METRICS.find(([key]) => key === metric)?.[1] ?? "social.post.level")}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} className="reality-chart-axis" />
            {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} className="reality-chart-crosshair" /> : null}
            {points.length > 1 ? <path d={path} className="reality-chart-line" /> : null}
            {active ? <circle cx={x(hover ?? points.length - 1)} cy={y(active.value)} r={5} className="reality-chart-dot" /> : null}
            <text x={pad.left} y={height - 6} className="reality-chart-label">{formatShortDate(points[0].date, locale)}</text>
            {points.length > 1 ? <text x={width - pad.right} y={height - 6} textAnchor="end" className="reality-chart-label">{formatShortDate(points.at(-1)!.date, locale)}</text> : null}
          </svg>
          <details className="reality-chart-table">
            <summary>{t("reality.table")}</summary>
            <table>
              <tbody>
                {points.slice().reverse().map((point) => <tr key={point.date}><th scope="row">{formatShortDate(point.date, locale)}</th><td>{format(point.value)}</td></tr>)}
              </tbody>
            </table>
          </details>
        </>
      ) : <p className="reality-empty">{t("reality.chartEmpty")}</p>}
    </div>
  );
}

function RealityCalendar({ days, today, locale, t, onOpen }: { days: RealityDay[]; today: string; locale: AppLocale; t: Translate; onOpen: (day: RealityDay) => void }) {
  const weeks = useMemo(() => realityCalendar(days, today, 12), [days, today]);
  return (
    <div className="reality-calendar" role="grid" aria-label={t("reality.tab.calendar")}>
      {weeks.map((week) => (
        <div className="reality-calendar-week" role="row" key={week[0].date}>
          {week.map((cell) => cell.day ? (
            <button
              key={cell.date}
              type="button"
              role="gridcell"
              className={`reality-calendar-cell active${cell.day.postType === "level_up" ? " level-up" : ""}`}
              aria-label={`${formatShortDate(cell.date, locale)}: ${t("reality.watch")}`}
              onClick={() => onOpen(cell.day!)}
            />
          ) : (
            <span key={cell.date} role="gridcell" aria-hidden="true" className={`reality-calendar-cell${cell.future ? " future" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function StoryPlayer({ days, startIndex, locale, t, onClose }: { days: RealityDay[]; startIndex: number; locale: AppLocale; t: Translate; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const reducedMotion = useRef(false);
  const day = days[index];

  const go = useCallback((delta: number) => {
    setElapsed(0);
    setIndex((current) => {
      const next = current + delta;
      if (next < 0) return 0;
      if (next >= days.length) { onClose(); return current; }
      return next;
    });
  }, [days.length, onClose]);

  useEffect(() => {
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  useEffect(() => {
    if (reducedMotion.current) return;
    const started = Date.now() - elapsed;
    const timer = window.setInterval(() => {
      const passed = Date.now() - started;
      if (passed >= STORY_MS) go(1);
      else setElapsed(passed);
    }, 100);
    return () => window.clearInterval(timer);
    // Restart the timer only when the slide changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, go]);

  if (!day) return null;
  const caption = day.body && !/^(My Growth: |Daily Core progress for )/.test(day.body) ? day.body : null;
  const stats: Array<[MessageKey, string]> = [];
  if (day.level !== null) stats.push(["social.post.level", day.levelBefore !== null && day.levelBefore !== day.level ? `${day.levelBefore} → ${day.level}` : String(day.level)]);
  if (day.turnover !== null) stats.push(["social.post.turnover", `+${formatAdaptiveMoney(day.turnover, locale)}`]);
  if (day.wins !== null) stats.push(["social.post.wins", String(day.wins)]);
  if (day.coreGrowth !== null) stats.push(["social.post.totalCoreGrowth", `+${formatAdaptiveMoney(day.coreGrowth, locale)}`]);

  return (
    <div className="reality-story-backdrop" role="dialog" aria-modal="true" aria-label={t("reality.watch")}>
      <div className="reality-story">
        <div className="reality-story-progress" aria-hidden="true">
          {days.map((item, itemIndex) => (
            <span key={item.postId}><i style={{ width: itemIndex < index ? "100%" : itemIndex === index ? `${Math.min(100, (elapsed / STORY_MS) * 100)}%` : "0%" }} /></span>
          ))}
        </div>
        {day.cover?.url ? (
          day.cover.type === "video"
            ? <video className="reality-story-media" src={day.cover.url} autoPlay muted playsInline loop />
            // eslint-disable-next-line @next/next/no-img-element
            : <img className="reality-story-media" src={day.cover.url} alt="" />
        ) : <div className="reality-story-media placeholder" />}
        <div className="reality-story-top">
          <strong>{formatLongDate(day.date, locale)}</strong>
          <button type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={20} /></button>
        </div>
        <button className="reality-story-tap prev" type="button" aria-label={t("reality.prev")} onClick={() => go(-1)}><ChevronLeft size={22} aria-hidden="true" /></button>
        <button className="reality-story-tap next" type="button" aria-label={t("reality.next")} onClick={() => go(1)}><ChevronRight size={22} aria-hidden="true" /></button>
        <div className="reality-story-bottom">
          {caption ? <p>{caption}</p> : null}
          <div className="reality-story-stats">
            {stats.map(([label, value]) => <span key={label}><small>{t(label)}</small><strong>{value}</strong></span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatShortDate(date: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function formatLongDate(date: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
