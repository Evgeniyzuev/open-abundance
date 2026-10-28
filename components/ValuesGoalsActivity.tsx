"use client";

import { Heart, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Sheet from "@/components/ui/Sheet";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { pick } from "@/lib/locales";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { classifySwipe } from "@/lib/swipe";
import { emptyWheel, LIFE_SPHERES, orderGoalCards, WHEEL_MAX, CRITERIA_MAX_LENGTH, type GoalCard, type LifeSphereKey, type SwipeDecision, type Wheel } from "@/lib/lifeValues";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

export type ValuesProfile = {
  wheel: Wheel | null;
  wheelSavedAt: string | null;
  decisions: Record<string, SwipeDecision>;
  /** Wishes created from "I want" swipes. */
  wishIds?: string[];
  swipeCount: number;
  challengeSwipes: number;
};

const SWIPE_DISTANCE = 90;

/**
 * "Values and goals": the life balance wheel and the goal cards. Repeatable; lives in Wishes (My) and inside the
 * challenge. Swipes are sent one after another so the server row is never written by two requests at once.
 */
export default function ValuesGoalsActivity({ locale, t, onProgress }: { locale: AppLocale; t: TFunction; onProgress?: (profile: ValuesProfile) => void }) {
  const [profile, setProfile] = useState<ValuesProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<"wheel" | "cards">("wheel");
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/values?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
        const payload = (await response.json()) as { profile?: ValuesProfile; error?: string };
        if (!response.ok || !payload.profile) throw new Error(payload.error ?? t("values.loadFailed"));
        if (cancelled) return;
        setProfile(payload.profile);
        onProgressRef.current?.(payload.profile);
        setStep(payload.profile.wheelSavedAt ? "cards" : "wheel");
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : t("values.loadFailed"));
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  function applyProfile(next: ValuesProfile) {
    setProfile(next);
    onProgressRef.current?.(next);
  }

  if (loadError) return <p className="challenge-error">{loadError}</p>;
  if (!profile) return <p className="challenge-note">{t("app.common.loading")}</p>;

  const progress = Math.min(profile.swipeCount, profile.challengeSwipes);

  return (
    <section className="values-activity">
      <div className="values-tabs" role="tablist">
        <button aria-selected={step === "wheel"} className={step === "wheel" ? "active" : ""} role="tab" type="button" onClick={() => setStep("wheel")}>
          {t("values.tab.wheel")}{profile.wheelSavedAt ? " ✓" : ""}
        </button>
        <button aria-selected={step === "cards"} className={step === "cards" ? "active" : ""} role="tab" type="button" onClick={() => setStep("cards")}>
          {t("values.tab.cards")} {progress}/{profile.challengeSwipes}
        </button>
      </div>
      {step === "wheel" ? (
        <WheelStep locale={locale} saved={profile.wheel} t={t} onSaved={(next) => { applyProfile(next); setStep("cards"); }} />
      ) : (
        <CardsStep locale={locale} profile={profile} t={t} onProfile={applyProfile} />
      )}
    </section>
  );
}

function WheelStep({ locale, saved, t, onSaved }: { locale: AppLocale; saved: Wheel | null; t: TFunction; onSaved: (profile: ValuesProfile) => void }) {
  const [wheel, setWheel] = useState<Wheel>(() => saved ?? emptyWheel());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCriteria = LIFE_SPHERES.some((sphere) => wheel[sphere.key].criteria.trim().length >= 3);

  function update(key: LifeSphereKey, patch: Partial<Wheel[LifeSphereKey]>) {
    setWheel((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/values", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "wheel", wheel })
      }, { authRequired: true });
      const payload = (await response.json()) as { profile?: ValuesProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error ?? t("values.saveFailed"));
      onSaved(payload.profile);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("values.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="values-wheel">
      <p className="challenge-note">{t("values.wheel.lead")}</p>
      <WheelChart t={t} wheel={wheel} />
      {LIFE_SPHERES.map((sphere) => {
        const row = wheel[sphere.key];
        return (
          <div className="values-sphere" key={sphere.key}>
            <strong>{sphere.emoji} {pick(locale, sphere.title)}</strong>
            <label>
              <span>{t("values.wheel.now")} <b>{row.now}</b></span>
              <input aria-label={`${pick(locale, sphere.title)}: ${t("values.wheel.now")}`} max={WHEEL_MAX} min={0} step={1} type="range" value={row.now} onChange={(event) => update(sphere.key, { now: Number(event.target.value) })} />
            </label>
            <label>
              <span>{t("values.wheel.want")} <b>{row.want}</b></span>
              <input aria-label={`${pick(locale, sphere.title)}: ${t("values.wheel.want")}`} className="want" max={WHEEL_MAX} min={0} step={1} type="range" value={row.want} onChange={(event) => update(sphere.key, { want: Number(event.target.value) })} />
            </label>
            <input
              aria-label={`${pick(locale, sphere.title)}: ${t("values.wheel.criteria")}`}
              className="values-criteria"
              maxLength={CRITERIA_MAX_LENGTH}
              placeholder={`${t("values.wheel.criteria")}: ${pick(locale, sphere.criteriaHint)}`}
              type="text"
              value={row.criteria}
              onChange={(event) => update(sphere.key, { criteria: event.target.value })}
            />
          </div>
        );
      })}
      {!hasCriteria ? <p className="challenge-note">{t("values.wheel.criteriaRequired")}</p> : null}
      {error ? <p className="challenge-error">{error}</p> : null}
      <button className="challenge-primary-action" disabled={saving || !hasCriteria} type="button" onClick={() => void save()}>
        {saving ? t("app.common.loading") : t("values.wheel.save")}
      </button>
    </div>
  );
}

function WheelChart({ t, wheel }: { t: TFunction; wheel: Wheel }) {
  const size = 220;
  const center = size / 2;
  const radius = 80;
  const point = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / LIFE_SPHERES.length - Math.PI / 2;
    const r = (radius * value) / WHEEL_MAX;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)] as const;
  };
  const polygon = (field: "now" | "want") => LIFE_SPHERES.map((sphere, index) => point(index, wheel[sphere.key][field]).join(",")).join(" ");
  return (
    <figure className="values-chart">
      <svg aria-label={t("values.wheel.chart")} role="img" viewBox={`0 0 ${size} ${size}`}>
        {[2.5, 5, 7.5, 10].map((level) => (
          <polygon className="grid" key={level} points={LIFE_SPHERES.map((_, index) => point(index, level).join(",")).join(" ")} />
        ))}
        {LIFE_SPHERES.map((sphere, index) => {
          const [x, y] = point(index, WHEEL_MAX);
          const [lx, ly] = point(index, WHEEL_MAX + 1.6);
          return (
            <g key={sphere.key}>
              <line className="grid" x1={center} x2={x} y1={center} y2={y} />
              <text dominantBaseline="middle" textAnchor="middle" x={lx} y={ly}>{sphere.emoji}</text>
            </g>
          );
        })}
        <polygon className="want" points={polygon("want")} />
        <polygon className="now" points={polygon("now")} />
      </svg>
      <figcaption>
        <span className="now">{t("values.wheel.now")}</span>
        <span className="want">{t("values.wheel.want")}</span>
      </figcaption>
    </figure>
  );
}

function CardsStep({ locale, profile, t, onProfile }: { locale: AppLocale; profile: ValuesProfile; t: TFunction; onProfile: (profile: ValuesProfile) => void }) {
  const [review, setReview] = useState(false);
  const [deck, setDeck] = useState<GoalCard[]>(() => orderGoalCards(profile.wheel, new Set(Object.keys(profile.decisions))));
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localCount, setLocalCount] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const wantedCount = useMemo(() => Object.values(profile.decisions).filter((decision) => decision === "want").length, [profile.decisions]);
  const card = deck[index] ?? null;
  const shownCount = Math.max(profile.swipeCount, localCount);

  function decide(decision: SwipeDecision) {
    if (!card) return;
    const cardKey = card.key;
    setIndex((current) => current + 1);
    setDx(0);
    setLocalCount((current) => Math.max(current, profile.swipeCount) + 1);
    queue.current = queue.current.then(async () => {
      try {
        const response = await fetchWithSupabaseAuth("/api/values", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "swipe", cardKey, decision, locale })
        }, { authRequired: true });
        const payload = (await response.json()) as { profile?: ValuesProfile; wishCreated?: boolean; error?: string };
        if (!response.ok || !payload.profile) throw new Error(payload.error ?? t("values.saveFailed"));
        onProfile(payload.profile);
        setError(null);
        if (payload.wishCreated) setNotice(t("values.cards.wishAdded"));
      } catch (swipeError) {
        setError(swipeError instanceof Error ? swipeError.message : t("values.saveFailed"));
      }
    });
  }

  function restart() {
    setReview(true);
    setDeck(orderGoalCards(profile.wheel, new Set()));
    setIndex(0);
    setNotice(null);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== event.pointerId) return;
    setDx(event.clientX - start.current.x);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== event.pointerId) return;
    const direction = classifySwipe(event.clientX - start.current.x, event.clientY - start.current.y, SWIPE_DISTANCE);
    start.current = null;
    if (direction === "right") decide("want");
    else if (direction === "left") decide("skip");
    else setDx(0);
  }

  const sphere = card ? LIFE_SPHERES.find((item) => item.key === card.sphere) : null;
  const gap = card && profile.wheel ? profile.wheel[card.sphere].want - profile.wheel[card.sphere].now : 0;

  return (
    <div className="values-cards">
      <p className="challenge-note">
        {t("values.cards.progress", { count: shownCount, target: profile.challengeSwipes })} · {t("values.cards.wanted", { count: wantedCount })}
      </p>
      {card ? (
        <>
          <div
            aria-label={pick(locale, card.title)}
            className="values-card"
            role="group"
            style={{ transform: `translateX(${dx}px) rotate(${dx / 18}deg)` }}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") decide("want");
              if (event.key === "ArrowLeft") decide("skip");
            }}
            onPointerCancel={() => { start.current = null; setDx(0); }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <span className="values-card-stamp want" style={{ opacity: Math.max(0, Math.min(1, dx / SWIPE_DISTANCE)) }}>{t("values.cards.want")}</span>
            <span className="values-card-stamp skip" style={{ opacity: Math.max(0, Math.min(1, -dx / SWIPE_DISTANCE)) }}>{t("values.cards.skip")}</span>
            <span className="values-card-emoji" aria-hidden="true">{card.emoji}</span>
            <strong>{pick(locale, card.title)}</strong>
            <p>{pick(locale, card.description)}</p>
            {sphere ? <small>{sphere.emoji} {pick(locale, sphere.title)}{gap > 0 ? ` · ${t("values.cards.gap", { gap })}` : ""}</small> : null}
          </div>
          <div className="values-card-actions">
            <button aria-label={t("values.cards.skip")} className="skip" type="button" onClick={() => decide("skip")}><X size={22} /> {t("values.cards.skip")}</button>
            <button aria-label={t("values.cards.want")} className="want" type="button" onClick={() => decide("want")}><Heart size={22} /> {t("values.cards.want")}</button>
          </div>
          <p className="values-card-hint">{t("values.cards.hint")}</p>
        </>
      ) : (
        <div className="values-cards-done">
          <strong>{t(review ? "values.cards.reviewDone" : "values.cards.done")}</strong>
          <p className="challenge-note">{t("values.cards.doneHint")}</p>
          <button className="challenge-secondary-action" type="button" onClick={restart}><RotateCcw size={16} /> {t("values.cards.restart")}</button>
        </div>
      )}
      {notice ? <p className="challenge-note" role="status">{notice}</p> : null}
      {error ? <p className="challenge-error">{error}</p> : null}
    </div>
  );
}

/** The entry in the feed: a short card that opens the activity in a sheet. */
export function ValuesFeedCard({ locale, t, compact = false, title }: { locale: AppLocale; t: TFunction; compact?: boolean; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`values-feed-card${compact ? " compact" : ""}`} type="button" onClick={() => setOpen(true)}>
        <span className="values-feed-emoji" aria-hidden="true">🧭</span>
        <span className="values-feed-copy">
          <small>{t("values.feed.eyebrow")}</small>
          <strong>{title ?? t("values.feed.title")}</strong>
          <span>{t("values.feed.text")}</span>
        </span>
        <span className="values-feed-open">{t("values.feed.open")}</span>
      </button>
      {open ? (
        <Sheet fullscreen className="values-sheet" closeLabel={t("app.common.close")} title={t("values.sheetTitle")} titleId="values-sheet-title" onClose={() => setOpen(false)}>
          <ValuesGoalsActivity locale={locale} t={t} />
        </Sheet>
      ) : null}
    </>
  );
}
