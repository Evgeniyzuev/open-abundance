"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Info, KeyRound } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { Confetti, NovaCheer } from "@/components/ui/Celebration";
import { useUserContext } from "@/components/UserProvider";
import { trackClientEvent } from "@/lib/clientAnalytics";
import { chestBar, type ChestState } from "@/lib/dailyChests";
import type { MessageKey } from "@/lib/i18n";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { playUiSound } from "@/lib/ui/sound";

// Daily chests (lib/dailyChests.ts): the day bar with the key and tomorrow's chest, and the chest opening scene.

const SHAKE_MS = 1800;
const NOVA_LINES = ["chests.nova.1", "chests.nova.2", "chests.nova.3", "chests.nova.4"] as const;

function money(amount: number, locale: string) {
  return formatRoundedMoney(amount, locale as never);
}

/** A small treasure chest drawn inline, so it looks the same on every device (the chest emoji is too new). */
export function ChestIcon({ open = false, size = 28 }: { open?: boolean; size?: number }) {
  return (
    <svg className={`chest-icon${open ? " open" : ""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <g className="chest-icon-lid">
        <path d="M8 28 C8 14 56 14 56 28 Z" fill="#b8692f" />
        <path d="M8 28 C8 14 56 14 56 28" fill="none" stroke="#7a3f17" strokeWidth="3" />
        <rect x="28" y="16" width="8" height="12" fill="#f4c542" />
      </g>
      <rect x="8" y="28" width="48" height="28" rx="3" fill="#a65a26" stroke="#7a3f17" strokeWidth="3" />
      <rect x="8" y="34" width="48" height="5" fill="#f4c542" />
      <rect x="27" y="30" width="10" height="12" rx="2" fill="#f4c542" stroke="#9a7414" strokeWidth="1.5" />
      <circle cx="32" cy="36" r="1.8" fill="#7a3f17" />
    </svg>
  );
}

export function useChestState(refreshKey?: unknown) {
  const { user } = useUserContext();
  const [state, setState] = useState<ChestState | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetchWithSupabaseAuth(`/api/chests?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
      if (!response.ok) return;
      const payload = (await response.json()) as ChestState & { added?: string[] };
      setState(payload);
      if (payload.added?.length) {
        setAdded(payload.added);
        void trackClientEvent("chest_added", { kinds: payload.added.join(",") });
      }
    } catch {
      // The chest card is an extra: without it the page works as before.
    }
  }, [user]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  return { state, added, reload: load, setState };
}

/** The slim day bar: Core earned today, the key mark and tomorrow's chest at the end. Fills with a short animation. */
export function ChestDayBar({ state }: { state: ChestState }) {
  const { locale, t } = useUserContext();
  const bar = chestBar(state.earnedToday, state.keyAt, state.nextChestAt);
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFill(bar.fill));
    return () => cancelAnimationFrame(frame);
  }, [bar.fill]);
  return (
    <div className="chest-bar" role="img" aria-label={t("chests.today", { amount: money(state.earnedToday, locale) })}>
      <span className="chest-bar-fill" style={{ width: `${fill * 100}%` }} />
      <span className={`chest-bar-mark key${bar.keyReached ? " reached" : ""}${state.keyUsedToday ? " used" : ""}`} style={{ left: `${bar.keyMark * 100}%` }}>
        <KeyRound size={10} />
      </span>
      <span className={`chest-bar-mark chest${bar.chestReached ? " reached" : ""}`} style={{ left: "100%" }}>
        <ChestIcon size={18} />
      </span>
    </div>
  );
}

function statusLine(state: ChestState, t: ReturnType<typeof useUserContext>["t"], locale: string): string {
  const bar = chestBar(state.earnedToday, state.keyAt, state.nextChestAt);
  if (state.openable) return t("chests.keyReady");
  if (!state.chest) {
    if (state.completedTasks < state.firstChestAfterTasks) return t("chests.firstAfter", { done: state.completedTasks, count: state.firstChestAfterTasks });
    return bar.chestReached ? t("chests.chestTomorrow") : t("chests.toChest", { amount: money(bar.toChest, locale) });
  }
  if (state.chest.opensOn > state.today) return t("chests.chestTomorrow");
  if (state.keyUsedToday) return bar.chestReached || state.tomorrowChestEarned ? t("chests.chestTomorrow") : t("chests.keyUsed", { amount: money(bar.toChest, locale) });
  return t("chests.toKey", { amount: money(bar.toKey, locale) });
}

/** One slim row on Home and on the task-done sheet: chest, status line, day bar; a small open button when a key fits. */
export function DailyChestCard({ inline = false, refreshKey }: { inline?: boolean; refreshKey?: unknown }) {
  const { locale, t } = useUserContext();
  const { state, added, reload, setState } = useChestState(refreshKey);
  const [opening, setOpening] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  if (!state) return null;
  const isNew = added.length > 0;
  return (
    <section className={`chest-strip${inline ? " inline" : ""}${state.openable ? " ready" : ""}`} aria-label={t("chests.title")}>
      <div className="chest-strip-row">
        <span className={`chest-strip-icon${state.openable || isNew ? " wiggle" : ""}`}><ChestIcon size={26} /></span>
        <div className="chest-strip-main">
          <small>{isNew ? t(added.includes("tomorrow") ? "chests.newTomorrow" : "chests.newFirst") : statusLine(state, t, locale)}</small>
          <ChestDayBar state={state} />
        </div>
        {state.openable ? (
          <button className="chest-strip-open" type="button" onClick={() => setOpening(true)}>
            <KeyRound size={14} />{t("chests.openShort")}
          </button>
        ) : !inline ? (
          <button aria-expanded={rulesOpen} aria-label={t("chests.howTitle")} className="chest-strip-info" type="button" onClick={() => setRulesOpen((open) => !open)}>
            <Info size={16} />
          </button>
        ) : null}
      </div>
      {rulesOpen && !inline ? (
        <div className="chest-strip-rules">
          <p>{t("chests.how", { key: money(state.keyAt, locale), chest: money(state.nextChestAt, locale), count: state.firstChestAfterTasks })}</p>
          <p>{t("chests.odds", { odds: state.odds.map((item) => `${item.percent}% ${money(item.amount, locale)}`).join(" · "), expected: money(state.expectedAmount, locale) })}</p>
        </div>
      ) : null}
      {opening ? (
        <ChestOpenSheet
          state={state}
          onDone={(next) => { setOpening(false); if (next) setState(next); else void reload(); }}
        />
      ) : null}
    </section>
  );
}

type OpenResult = { reward: number; core?: { balance?: number } | null; state?: ChestState };

/** The opening scene: the chest shakes for a moment, then opens with light, sound and Nova's delight. */
function ChestOpenSheet({ state, onDone }: { state: ChestState; onDone: (next: ChestState | null) => void }) {
  const { applyServerData, locale, t } = useUserContext();
  const [phase, setPhase] = useState<"shaking" | "open" | "error">("shaking");
  const [result, setResult] = useState<OpenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const lineRef = useRef<MessageKey>(NOVA_LINES[Math.floor(Math.random() * NOVA_LINES.length)]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const ticks = reduced ? [] : [0, 450, 800, 1100, 1350, 1550].map((delay) => window.setTimeout(() => playUiSound("chestTick", { unlessMuted: true }), delay));
    const wait = new Promise((resolve) => window.setTimeout(resolve, reduced ? 300 : SHAKE_MS));
    const request = fetchWithSupabaseAuth("/api/chests", { method: "POST" }, { authRequired: true })
      .then(async (response) => {
        const payload = (await response.json()) as OpenResult & { error?: string };
        if (!response.ok || payload.error) throw new Error(payload.error ?? t("chests.error"));
        return payload;
      });
    Promise.all([request, wait])
      .then(([payload]) => {
        setResult(payload);
        setPhase("open");
        playUiSound("chestOpen", { unlessMuted: true });
        if (payload.core) applyServerData({ core: payload.core as never });
        void trackClientEvent("chest_opened", { reward: payload.reward });
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : t("chests.error"));
        setPhase("error");
      })
      .finally(() => ticks.forEach((id) => window.clearTimeout(id)));
  }, [applyServerData, t]);

  // The amount counts up after the lid opens.
  useEffect(() => {
    if (phase !== "open" || !result) return;
    const target = result.reward;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 900);
      setShown(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, result]);

  const big = (result?.reward ?? 0) >= 1;
  return (
    <Sheet bare dismissible={phase !== "shaking"} className="small chest-open-sheet" titleId="chest-open-title" onClose={() => onDone(result?.state ?? null)}>
      <h2 id="chest-open-title" className="sr-only">{t("chests.title")}</h2>
      <div className={`chest-stage ${phase}`}>
        {phase === "open" ? <span className="chest-rays" aria-hidden="true" /> : null}
        {phase === "open" ? <Confetti /> : null}
        {phase === "open" ? (
          <span className="chest-coins" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} style={{ ["--i" as string]: index }} />)}</span>
        ) : null}
        <ChestIcon open={phase === "open"} size={132} />
      </div>
      {phase === "shaking" ? <p className="chest-stage-text">{t("chests.opening")}</p> : null}
      {phase === "open" && result ? (
        <>
          <p className="chest-reward-label">{t("chests.reward")}</p>
          <strong className="chest-reward-amount">+{money(shown, locale)} Core</strong>
          <NovaCheer text={t(big ? "chests.nova.big" : lineRef.current)} />
          <button className="challenge-primary-action" type="button" onClick={() => onDone(result.state ?? null)}>{t("chests.take")}</button>
        </>
      ) : null}
      {phase === "error" ? (
        <>
          <p className="chest-stage-text">{error}</p>
          <button className="challenge-secondary-action" type="button" onClick={() => onDone(null)}>{t("app.common.close")}</button>
        </>
      ) : null}
      <p className="chest-odds-line">{t("chests.odds", { odds: state.odds.map((item) => `${item.percent}% ${money(item.amount, locale)}`).join(" · "), expected: money(state.expectedAmount, locale) })}</p>
    </Sheet>
  );
}
