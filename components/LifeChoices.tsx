"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowUpToLine, BarChart3, BatteryLow, BookOpen, Bot, Briefcase, CalendarX, Car, Check, CigaretteOff, Clock,
  Coins, CreditCard, Dumbbell, Flame, Gift, GraduationCap, Handshake, Heart, HeartHandshake, HeartPulse, HelpCircle, Home,
  Hourglass, Languages, Laptop, Lightbulb, LineChart, Minus, Moon, Music, Package, Palette, PiggyBank, Plane, Rocket, Salad,
  Scale, Search, ShieldAlert, ShoppingBag, Shuffle, Smile, Sparkles, Store, ThumbsUp, TrendingUp, UserX, Users, Wallet, Wrench, X,
  type LucideIcon
} from "lucide-react";
import {
  lifeChoicesEnabled,
  LIFE_OBSTACLES,
  LIFE_SPHERES,
  LIFE_STATS,
  LIFE_STORAGE,
  lifeCursor,
  lifeGuess,
  lifeLook,
  lifeQuestMotives,
  lifeStats,
  lifeText,
  lifeUi,
  lifeWeakest,
  lifeWishes,
  statName,
  type LifeAnswers,
  type LifeLevel,
  type LifeLook,
  type LifeOption,
  type LifeStats
} from "@/lib/lifeChoices";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { trackProductEvent } from "@/lib/productAnalytics";
import { playUiSound } from "@/lib/ui/sound";

// One flat icon set (the app's own lucide icons) for every choice, spheres and reasons.
const ICONS: Record<string, LucideIcon> = {
  AlertTriangle, ArrowUpToLine, BarChart3, BatteryLow, BookOpen, Bot, Briefcase, CalendarX, Car, Check, CigaretteOff, Clock,
  Coins, CreditCard, Dumbbell, Flame, Gift, GraduationCap, Handshake, Heart, HeartHandshake, HeartPulse, HelpCircle, Home,
  Hourglass, Languages, Laptop, Lightbulb, LineChart, Minus, Moon, Music, Package, Palette, PiggyBank, Plane, Rocket, Salad,
  Scale, Search, ShieldAlert, ShoppingBag, Shuffle, Smile, Sparkles, Store, ThumbsUp, TrendingUp, UserX, Users, Wallet, Wrench, X
};

function LifeIcon({ name, color, size = 26 }: { name: string; color: string; size?: number }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <span className="life-icon" style={{ background: `${color}26`, color }} aria-hidden="true"><Icon size={size} strokeWidth={2.2} /></span>;
}

/** A simple flat third-person character; its body, face and the things around follow the stats. */
export function LifeCharacter({ look, stats, size = 160 }: { look: LifeLook; stats: LifeStats; size?: number }) {
  const v = lifeLook(stats);
  const skin = v.healthy ? "#f1c7a0" : "#c9bda6";
  const shirt = look === "woman" ? "#e0567a" : look === "man" ? "#3f6fd8" : "#8a5bd6";
  const hair = "#3b2a20";
  const w = v.bodyWidth * 1.6;
  return (
    <svg className="life-character" viewBox="0 0 200 210" width={size} height={size * 1.05} role="img" aria-label="">
      {v.free ? <circle cx="168" cy="30" r="14" fill="#ffd66b" /> : null}
      {v.glow ? <circle cx="100" cy="120" r="78" fill="rgba(120, 220, 150, 0.22)" /> : null}
      <ellipse cx="100" cy="196" rx="80" ry="8" fill="rgba(0,0,0,0.18)" />
      {v.friends >= 1 ? <g fill="#9aa6c8"><circle cx="30" cy="128" r="12" /><rect x="18" y="142" width="24" height="44" rx="10" /></g> : null}
      {v.friends >= 2 ? <g fill="#b6a0d6"><circle cx="170" cy="128" r="12" /><rect x="158" y="142" width="24" height="44" rx="10" /></g> : null}
      {look === "woman" ? <rect x="74" y="66" width="52" height="58" rx="22" fill={hair} /> : null}
      <rect x="88" y="160" width="10" height="34" rx="4" fill="#2f3b5c" />
      <rect x="102" y="160" width="10" height="34" rx="4" fill="#2f3b5c" />
      <rect x={100 - w / 2} y="104" width={w} height="64" rx={Math.min(30, w / 2)} fill={shirt} />
      <circle cx="100" cy="82" r="22" fill={skin} />
      {look === "man" ? <path d="M78 78 Q80 56 100 56 Q120 56 122 78 Q112 66 100 68 Q88 66 78 78Z" fill={hair} /> : null}
      {look === "woman" ? <path d="M78 80 Q78 56 100 56 Q122 56 122 80 Q110 64 100 66 Q90 64 78 80Z" fill={hair} /> : null}
      {look === "other" ? <><circle cx="100" cy="56" r="9" fill={hair} /><path d="M78 80 Q80 60 100 60 Q120 60 122 80 Q110 68 100 70 Q90 68 78 80Z" fill={hair} /></> : null}
      {v.tired ? <><path d="M88 82 h8" stroke="#3b2a20" strokeWidth="2.5" strokeLinecap="round" /><path d="M104 82 h8" stroke="#3b2a20" strokeWidth="2.5" strokeLinecap="round" /></> : <><circle cx="92" cy="81" r="2.6" fill="#2a1d16" /><circle cx="108" cy="81" r="2.6" fill="#2a1d16" /></>}
      {v.healthy ? <><circle cx="86" cy="90" r="3.5" fill="rgba(230,110,110,0.35)" /><circle cx="114" cy="90" r="3.5" fill="rgba(230,110,110,0.35)" /></> : null}
      <path d={v.sad ? "M93 96 Q100 92 107 96" : v.healthy && !v.tired ? "M92 93 Q100 99 108 93" : "M93 95 L107 95"} stroke="#7a3b2e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {v.books ? <g><rect x="134" y="176" width="30" height="7" rx="2" fill="#4f9be0" /><rect x="136" y="169" width="26" height="7" rx="2" fill="#e09a4f" /><rect x="133" y="162" width="28" height="7" rx="2" fill="#5fbf7a" /></g> : null}
      {Array.from({ length: v.coins }, (_, index) => <ellipse key={index} cx="52" cy={186 - index * 6} rx="12" ry="4" fill="#f2c14e" stroke="#c99a2e" />)}
      {v.debt ? <g><rect x="34" y="150" width="34" height="18" rx="5" fill="#d9534f" /><text x="51" y="163" fontSize="11" fontWeight="900" textAnchor="middle" fill="#fff">−$</text></g> : null}
    </svg>
  );
}

type Phase = "look" | "play" | "final";
type Reveal = { sphere: string; level: LifeLevel; key: string } | null;
type Progress = { look: LifeLook; phase: Phase; answers: LifeAnswers };

function readProgress(): Progress | null {
  try {
    const raw = window.localStorage.getItem(LIFE_STORAGE.progress);
    const value = raw ? (JSON.parse(raw) as Progress) : null;
    return value && value.answers && typeof value.answers === "object" ? value : null;
  } catch {
    return null;
  }
}

/**
 * The first quest after sign-in when turned on (/?story=1): pick a look, then eight spheres of life. Each sphere starts
 * with "does this touch you?"; an indifferent answer moves on, a sensitive one goes deeper and ends with Nova's guess.
 * Every card flips to its consequence (chosen green and sharp, the others red and foggy) and the character changes.
 */
export function LifeChoices({ locale, onAnswered }: { locale: string; onAnswered: () => void }) {
  // Progress is kept on this device, so the cross closes the adventure and it opens again at the same place.
  const [saved] = useState(() => (typeof window === "undefined" ? null : readProgress()));
  const [look, setLook] = useState<LifeLook>(saved?.look ?? "man");
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "look");
  const [answers, setAnswers] = useState<LifeAnswers>(saved?.answers ?? {});
  const [reveal, setReveal] = useState<Reveal>(null);
  const [main, setMain] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      window.localStorage.setItem(LIFE_STORAGE.progress, JSON.stringify({ look, phase, answers }));
    } catch {
      // Without storage the adventure starts over next time.
    }
  }, [look, phase, answers]);

  const stats = lifeStats(answers);
  const cursor = lifeCursor(answers);
  // While a choice is revealed the cards of that step stay on screen, flipped, until "Next".
  const view = reveal
    ? { sphere: LIFE_SPHERES.findIndex((item) => item.key === reveal.sphere), level: reveal.level }
    : cursor;

  function answer(sphereKey: string, patch: Partial<LifeAnswers[string]>) {
    setAnswers((current) => ({ ...current, [sphereKey]: { ...current[sphereKey], ...patch } }));
  }

  function chooseCard(sphereKey: string, level: "entry" | "focus", option: LifeOption) {
    if (reveal) return;
    answer(sphereKey, { [level]: option.key });
    setReveal({ sphere: sphereKey, level, key: option.key });
    const sum = Object.values(option.effects).reduce((total, value) => total + value, 0);
    playUiSound(sum >= 0 ? "correct" : "wrong");
    trackProductEvent("life_choice", { sphere: sphereKey, level, choice: option.key, interest: option.interest ?? null });
  }

  function next() {
    setReveal(null);
    const after = lifeCursor(answers);
    if (!after) finish();
  }

  function verdict(sphereKey: string, value: "yes" | "no") {
    playUiSound("action");
    answer(sphereKey, { verdict: value });
    trackProductEvent("life_guess", { sphere: sphereKey, verdict: value });
    if (value === "yes" && !lifeCursor({ ...answers, [sphereKey]: { ...answers[sphereKey], verdict: value } })) finish();
  }

  function obstacle(sphereKey: string, key: string) {
    playUiSound("action");
    answer(sphereKey, { obstacle: key });
    trackProductEvent("life_obstacle", { sphere: sphereKey, obstacle: key });
    if (!lifeCursor({ ...answers, [sphereKey]: { ...answers[sphereKey], obstacle: key } })) finish();
  }

  function finish() {
    setPhase("final");
    playUiSound("reward");
    trackProductEvent("life_choices_done", {});
  }

  async function start() {
    const wishes = lifeWishes(answers, locale);
    const chosen = wishes.find((item) => item.focus === main) ?? wishes[0];
    setSaving(true);
    setError(null);
    try {
      window.localStorage.setItem(LIFE_STORAGE.result, JSON.stringify({ look, answers, main: chosen ?? null, wishes, at: new Date().toISOString() }));
    } catch {
      // The answers are only a convenience on this device.
    }
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chosen
          ? { verificationLogic: "first_step_motive", proofKey: "motive_chosen", motives: lifeQuestMotives(chosen.sphere), note: chosen.title.slice(0, 200) }
          : { verificationLogic: "first_step_motive", proofKey: "motive_chosen", motives: ["change"] })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "save_failed");
      trackProductEvent("life_choices_saved", { sphere: chosen?.sphere ?? "", focus: chosen?.focus ?? "", wishes: wishes.length });
      markLifeChoicesDone();
      onAnswered();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "save_failed");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "look") {
    return (
      <section className="life-choices">
        <p className="life-title">{lifeUi("lookTitle", locale)}</p>
        <div className="life-looks">
          {(["man", "woman", "other"] as LifeLook[]).map((item) => (
            <button className="life-look" key={item} type="button" onClick={() => { setLook(item); setPhase("play"); trackProductEvent("life_choices_started", { look: item }); }}>
              <LifeCharacter look={item} stats={lifeStats({})} size={84} />
              <span>{lifeUi(item, locale)}</span>
            </button>
          ))}
        </div>
        <p className="life-sub">{lifeUi("intro", locale)}</p>
      </section>
    );
  }

  if (phase === "final" || !view) {
    const wishes = lifeWishes(answers, locale);
    const selected = main ?? wishes[0]?.focus ?? null;
    const weakest = lifeWeakest(stats);
    return (
      <section className="life-choices">
        <p className="life-title">{lifeUi("finalTitle", locale)}</p>
        <div className="life-stage"><LifeCharacter look={look} stats={stats} size={170} /></div>
        <div className="life-stats">
          {LIFE_STATS.map((stat) => (
            <div className={stat === weakest ? "life-stat weak" : "life-stat"} key={stat}>
              <span>{statName(stat, locale)}</span>
              <b><i style={{ width: `${stats[stat] * 10}%` }} /></b>
            </div>
          ))}
        </div>
        {wishes.length ? (
          <>
            <p className="life-sub">{lifeUi("pickMain", locale)}</p>
            <div className="life-wishes" role="radiogroup" aria-label={lifeUi("important", locale)}>
              {wishes.map((wish) => {
                const sphere = LIFE_SPHERES.find((item) => item.key === wish.sphere)!;
                return (
                  <button className={wish.focus === selected ? "life-wish-row selected" : "life-wish-row"} key={`${wish.sphere}-${wish.focus}`} type="button" role="radio" aria-checked={wish.focus === selected} onClick={() => setMain(wish.focus)}>
                    <LifeIcon name={sphere.icon} color={sphere.color} size={18} />
                    <span>{wish.title}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : <p className="life-sub">{lifeUi("noWishes", locale)}</p>}
        <button className="challenge-primary-action" type="button" disabled={saving} onClick={() => void start()}>{lifeUi("start", locale)}</button>
        {error ? <p className="challenge-note">{error}</p> : null}
        <button className="challenge-secondary-action" type="button" onClick={() => { setAnswers({}); setMain(null); setReveal(null); setPhase("play"); }}>{lifeUi("replay", locale)}</button>
      </section>
    );
  }

  const sphere = LIFE_SPHERES[view.sphere];
  const current = answers[sphere.key] ?? {};
  const level = view.level;
  const options = level === "entry" ? sphere.entry : sphere.focus;
  const chosenKey = level === "entry" ? current.entry : current.focus;
  const revealed = Boolean(reveal);

  return (
    <section className="life-choices" style={{ ["--sphere" as string]: sphere.color }}>
      <div className="life-head">
        <div className="life-dots" aria-label={lifeUi("step", locale, { n: view.sphere + 1, total: LIFE_SPHERES.length })}>
          {LIFE_SPHERES.map((item, index) => <i key={item.key} className={index < view.sphere ? "done" : index === view.sphere ? "now" : ""} />)}
        </div>
        <div className="life-sphere"><LifeIcon name={sphere.icon} color={sphere.color} size={20} /><span>{lifeText(sphere.title, locale)}</span></div>
      </div>
      <div className="life-stage"><LifeCharacter look={look} stats={stats} size={120} /></div>

      {level === "entry" || level === "focus" ? (
        <>
          <p className="life-title">{lifeText(level === "entry" ? sphere.question : sphere.focusQuestion, locale)}</p>
          <div className={`life-cards count-${options.length}`}>
            {options.map((option) => {
              const state = !revealed ? "" : option.key === chosenKey ? " flipped picked" : " flipped other";
              return (
                <button className={`life-card${state}`} key={option.key} type="button" disabled={revealed} onClick={() => chooseCard(sphere.key, level, option)} aria-pressed={revealed && option.key === chosenKey}>
                  <span className="life-card-inner">
                    <span className="life-card-face front">
                      <LifeIcon name={option.icon} color={sphere.color} />
                      <span className="life-card-label">{lifeText(option.label, locale)}</span>
                    </span>
                    <span className="life-card-face back">
                      <span className="life-card-label">{lifeText(option.result, locale)}</span>
                      <span className="life-card-effects">
                        {Object.entries(option.effects).map(([stat, value]) => (
                          <em key={stat}>{statName(stat as keyof LifeStats, locale)} {value > 0 ? `+${value}` : value}</em>
                        ))}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {revealed ? <button className="challenge-primary-action life-next" type="button" onClick={next}>{lifeUi("next", locale)}</button> : null}
        </>
      ) : null}

      {level === "guess" && current.focus ? (
        <>
          <div className="life-nova"><strong>{lifeUi("nova", locale)}</strong><p>{lifeGuess(sphere.key, current.focus, locale)}</p></div>
          <div className="life-verdict">
            <button className="challenge-primary-action" type="button" onClick={() => verdict(sphere.key, "yes")}>{lifeUi("yes", locale)}</button>
            <button className="challenge-secondary-action" type="button" onClick={() => verdict(sphere.key, "no")}>{lifeUi("notQuite", locale)}</button>
          </div>
        </>
      ) : null}

      {level === "why" ? (
        <>
          <p className="life-title">{lifeUi("why", locale)}</p>
          <div className="life-reasons">
            {LIFE_OBSTACLES.map((item) => (
              <button className="life-reason" key={item.key} type="button" onClick={() => obstacle(sphere.key, item.key)}>
                <LifeIcon name={item.icon} color={sphere.color} size={18} />
                <span>{lifeText(item.label, locale)}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function markLifeChoicesDone() {
  try {
    window.localStorage.setItem(LIFE_STORAGE.done, "1");
    window.localStorage.removeItem(LIFE_STORAGE.progress);
  } catch {
    // The first quest itself still knows it is done.
  }
}

export const OPEN_LIFE_CHOICES_EVENT = "oa:open-life-choices";

/**
 * The full-screen adventure for a new account (turned on by /?story=1): opens by itself while the first quest is not
 * answered, once per app visit; the cross closes it and the first quest card has "Continue the adventure".
 */
export function LifeChoicesOverlay({ locale, userId }: { locale: string; userId: string | null }) {
  const [open, setOpen] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  useEffect(() => {
    const openNow = () => setOpen(true);
    window.addEventListener(OPEN_LIFE_CHOICES_EVENT, openNow);
    return () => window.removeEventListener(OPEN_LIFE_CHOICES_EVENT, openNow);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let enabled = false;
    try {
      enabled = lifeChoicesEnabled(window.location.search, (key) => window.localStorage.getItem(key), (key, value) => window.localStorage.setItem(key, value));
      if (!enabled || window.localStorage.getItem(LIFE_STORAGE.done) === "1" || window.sessionStorage.getItem(LIFE_STORAGE.closed) === "1") return;
    } catch {
      return;
    }
    let cancelled = false;
    void fetchWithSupabaseAuth("/api/challenges", { cache: "no-store" }, { authRequired: true })
      .then((response) => response.json())
      .then((payload: { quest?: { motive?: string | null }; challenges?: Array<{ id: string; verification_logic?: string; user_challenge_status?: string | null }> }) => {
        const first = payload.challenges?.find((item) => item.verification_logic === "first_step_motive");
        if (cancelled || !first || first.user_challenge_status === "completed" || payload.quest?.motive) return;
        setChallengeId(first.id);
        setOpen(true);
        trackProductEvent("life_choices_opened", { auto: true });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open) return null;

  function close() {
    try {
      window.sessionStorage.setItem(LIFE_STORAGE.closed, "1");
    } catch {
      // It may open again on the next screen change.
    }
    trackProductEvent("life_choices_closed", {});
    setOpen(false);
  }

  return (
    <div className="life-overlay" role="dialog" aria-modal="true">
      <button className="life-overlay-close" type="button" aria-label={lifeUi("close", locale)} onClick={close}><X size={22} /></button>
      <div className="life-overlay-body">
        <LifeChoices
          locale={locale}
          onAnswered={() => {
            setOpen(false);
            // The first quest card shows the answer and its reward button (the person claims it, nothing is automatic).
            window.dispatchEvent(new CustomEvent("oa:open-tab", { detail: { main: "challenges", ...(challengeId ? { challengeId } : {}) } }));
          }}
        />
      </div>
    </div>
  );
}

/** The first quest card after the adventure: the person's own main wish and sphere, and the reward button. */
export function LifeChoicesResult({ locale, claimLabel, claiming, onClaim, fallback }: { locale: string; claimLabel: string; claiming: boolean; onClaim: () => void; fallback: React.ReactNode }) {
  const [main, setMain] = useState<{ sphere: string; title: string } | null | undefined>(undefined);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LIFE_STORAGE.result);
      const value = raw ? (JSON.parse(raw) as { main?: { sphere?: string; title?: string } | null }) : null;
      setMain(value?.main?.sphere && value.main.title ? { sphere: value.main.sphere, title: value.main.title } : null);
    } catch {
      setMain(null);
    }
  }, []);
  if (main === undefined) return null;
  const sphere = main ? LIFE_SPHERES.find((item) => item.key === main.sphere) : null;
  if (!main || !sphere) return <>{fallback}</>;
  return (
    <section className="life-choices life-result" style={{ ["--sphere" as string]: sphere.color }}>
      <div className="life-sphere"><LifeIcon name={sphere.icon} color={sphere.color} size={20} /><span>{lifeText(sphere.title, locale)}</span></div>
      <p className="life-sub life-result-label">{lifeUi("yourMain", locale)}</p>
      <p className="life-title">{main.title}</p>
      <button className="challenge-primary-action" type="button" disabled={claiming} onClick={onClaim}>{claimLabel}</button>
    </section>
  );
}
