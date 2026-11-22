"use client";

import { useState } from "react";
import {
  LIFE_SCENES,
  LIFE_STATS,
  LIFE_STORAGE,
  lifeLook,
  lifeQuestMotives,
  lifeStats,
  lifeSummary,
  lifeText,
  lifeUi,
  statName,
  type LifeAnswers,
  type LifeLook,
  type LifeStats
} from "@/lib/lifeChoices";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { trackProductEvent } from "@/lib/productAnalytics";
import { playUiSound } from "@/lib/ui/sound";

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
      <path d={v.healthy && !v.tired ? "M92 93 Q100 99 108 93" : "M93 95 Q100 93 107 95"} stroke="#7a3b2e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {v.books ? <g><rect x="134" y="176" width="30" height="7" rx="2" fill="#4f9be0" /><rect x="136" y="169" width="26" height="7" rx="2" fill="#e09a4f" /><rect x="133" y="162" width="28" height="7" rx="2" fill="#5fbf7a" /></g> : null}
      {Array.from({ length: v.coins }, (_, index) => <ellipse key={index} cx="52" cy={186 - index * 6} rx="12" ry="4" fill="#f2c14e" stroke="#c99a2e" />)}
      {v.debt ? <g><rect x="34" y="150" width="34" height="18" rx="5" fill="#d9534f" /><text x="51" y="163" fontSize="11" fontWeight="900" textAnchor="middle" fill="#fff">−$</text></g> : null}
    </svg>
  );
}

type Phase = "look" | "scenes" | "final";

/**
 * The first step after sign-in when turned on (/?story=1): pick a look, then 8 choices of 2–4 cards; every card flips to
 * its consequence (the chosen one green and sharp, the others red and a little foggy) and the character changes.
 * Saves the first-step motive like the old question, so the path and its reward stay the same.
 */
export function LifeChoices({ locale, onAnswered }: { locale: string; onAnswered: () => void }) {
  const [look, setLook] = useState<LifeLook>("man");
  const [phase, setPhase] = useState<Phase>("look");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<LifeAnswers>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stats = lifeStats(answers);
  const scene = LIFE_SCENES[index];
  const chosen = scene ? answers[scene.key] : undefined;

  function choose(key: string) {
    if (!scene || chosen) return;
    setAnswers({ ...answers, [scene.key]: key });
    const option = scene.options.find((item) => item.key === key);
    const sum = Object.values(option?.effects ?? {}).reduce((total, value) => total + value, 0);
    playUiSound(sum >= 0 ? "correct" : "wrong");
    trackProductEvent("life_choice", { scene: scene.key, choice: key, index: index + 1 });
  }

  function next() {
    if (index + 1 < LIFE_SCENES.length) {
      setIndex(index + 1);
      return;
    }
    setPhase("final");
    playUiSound("reward");
    trackProductEvent("life_choices_done", { work: answers.work ?? "" });
  }

  async function start() {
    const summary = lifeSummary(answers, locale);
    setSaving(true);
    setError(null);
    try {
      window.localStorage.setItem(LIFE_STORAGE.result, JSON.stringify({ look, answers, at: new Date().toISOString() }));
    } catch {
      // The answers are only a convenience on this device.
    }
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationLogic: "first_step_motive", proofKey: "motive_chosen", motives: lifeQuestMotives(answers) })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "save_failed");
      trackProductEvent("life_choices_saved", { weakest: summary.weakest, work: answers.work ?? "" });
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
            <button className="life-look" key={item} type="button" onClick={() => { setLook(item); setPhase("scenes"); trackProductEvent("life_choices_started", { look: item }); }}>
              <LifeCharacter look={item} stats={lifeStats({})} size={84} />
              <span>{lifeUi(item, locale)}</span>
            </button>
          ))}
        </div>
        <p className="life-sub">{lifeUi("intro", locale)}</p>
      </section>
    );
  }

  if (phase === "final") {
    const summary = lifeSummary(answers, locale);
    return (
      <section className="life-choices">
        <p className="life-title">{lifeUi("finalTitle", locale)}</p>
        <div className="life-stage"><LifeCharacter look={look} stats={stats} size={190} /></div>
        <div className="life-stats">
          {LIFE_STATS.map((stat) => (
            <div className={stat === summary.weakest ? "life-stat weak" : "life-stat"} key={stat}>
              <span>{statName(stat, locale)}</span>
              <b><i style={{ width: `${stats[stat] * 10}%` }} /></b>
            </div>
          ))}
        </div>
        <p className="life-sub">{lifeUi("weakest", locale, { stat: statName(summary.weakest, locale).toLowerCase() })}</p>
        <p className="life-wish">{lifeUi("wish", locale, { wish: summary.wish })}</p>
        <button className="challenge-primary-action" type="button" disabled={saving} onClick={() => void start()}>{lifeUi("start", locale)}</button>
        {error ? <p className="challenge-note">{error}</p> : null}
        <button className="challenge-secondary-action" type="button" onClick={() => { setAnswers({}); setIndex(0); setPhase("scenes"); }}>{lifeUi("replay", locale)}</button>
      </section>
    );
  }

  return (
    <section className="life-choices">
      <div className="life-head">
        <span className="life-step">{lifeUi("step", locale, { n: index + 1, total: LIFE_SCENES.length })}</span>
        <p className="life-title"><span aria-hidden="true">{scene.icon}</span> {lifeText(scene.title, locale)}</p>
      </div>
      <div className="life-stage"><LifeCharacter look={look} stats={stats} size={130} /></div>
      <div className={`life-cards count-${scene.options.length}`}>
        {scene.options.map((option) => {
          const state = !chosen ? "" : option.key === chosen ? " flipped picked" : " flipped other";
          return (
            <button className={`life-card${state}`} key={option.key} type="button" disabled={Boolean(chosen)} onClick={() => choose(option.key)} aria-pressed={option.key === chosen}>
              <span className="life-card-inner">
                <span className="life-card-face front">
                  <span className="life-card-icon" aria-hidden="true">{option.icon}</span>
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
      {chosen ? <button className="challenge-primary-action life-next" type="button" onClick={next}>{lifeUi("next", locale)}</button> : null}
    </section>
  );
}
