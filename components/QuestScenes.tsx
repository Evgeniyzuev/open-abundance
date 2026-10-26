"use client";

import { useEffect, useMemo, useState } from "react";
import { OPEN_AI_PROMPT_EVENT } from "@/lib/noteAiClient";
import ChannelCodeChallenge from "@/components/ChannelCodeChallenge";
import { InstallGuideDetails } from "@/components/InstallGuide";
import { DAILY_CORE_RATE } from "@/lib/coreCalculator";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { isStandaloneDisplay } from "@/lib/installPing";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { canPromptPwaInstall, promptPwaInstall, subscribeToPwaInstallPrompt } from "@/lib/pwaInstall";
import { MOTIVE_NOTE_MAX, QUEST_MOTIVES, requiredDailyAddition, type QuestMotive } from "@/lib/questPath";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

/** Nova's line for a quest: one per path quest, a general one otherwise. */
export function novaLine(verificationLogic: string | null | undefined, t: TFunction): string {
  const key = `quests.nova.${verificationLogic ?? ""}` as MessageKey;
  const line = t(key);
  return line === key ? t("quests.nova.default") : line;
}

/** With `askText`, tapping Nova opens her chat with that question ready; the person still presses Send. */
export function NovaBubble({ text, t, askText }: { text: string; t: TFunction; askText?: string }) {
  if (!askText) {
    return (
      <div className="quest-nova">
        <img alt="" className="quest-nova-avatar" src="/nova-fox-robot.webp" />
        <p><strong>{t("quests.nova.name")}</strong>{text}</p>
      </div>
    );
  }
  return (
    <button className="quest-nova quest-nova-ask" type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_AI_PROMPT_EVENT, { detail: { text: askText } }))}>
      <img alt="" className="quest-nova-avatar" src="/nova-fox-robot.webp" />
      <p><strong>{t("quests.nova.name")}</strong>{text}<span className="quest-nova-cta">{t("quests.nova.ask")} →</span></p>
    </button>
  );
}

/**
 * "First step": the opening scene of the path. The person says why they are here, one answer or several; the answers
 * go to the profile (app/api/challenges/progress) and steer which side quests come first. The second scene sums the
 * answers up, says how many others came for the same, and the reward is taken from there.
 */
export function FirstStepQuest({ question, t, onAnswered }: { question: string; t: TFunction; onAnswered: (motives: QuestMotive[]) => void }) {
  const [chosen, setChosen] = useState<QuestMotive[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [peers, setPeers] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = peers !== null;
  const needsNote = chosen.includes("own") && !note.trim();

  function toggle(motive: QuestMotive) {
    setChosen((current) => (current.includes(motive) ? current.filter((item) => item !== motive) : [...current, motive]));
  }

  async function save() {
    if (chosen.length === 0 || needsNote) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationLogic: "first_step_motive", proofKey: "motive_chosen", motives: chosen, note: chosen.includes("own") ? note.trim() : undefined })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; motivePeers?: Record<string, number> };
      if (!response.ok || payload.error) throw new Error(payload.error ?? t("quests.firstStep.saveFailed"));
      setPeers(payload.motivePeers ?? {});
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("quests.firstStep.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const label = (motive: QuestMotive) => (motive === "own" ? note.trim() : t(`quests.firstStep.option.${motive}` as MessageKey));

  return (
    <section className="quest-scene">
      <div className="quest-scene-art" aria-hidden="true"><span className={saved ? "quest-star lit" : "quest-star"} /></div>
      <span className="quest-scene-step">{saved ? t("quests.firstStep.scene2") : t("quests.firstStep.scene1")}</span>
      {!saved ? (
        <>
          <p className="quest-scene-text">{question}</p>
          <p className="quest-scene-hint">{t("quests.firstStep.multi")}</p>
          <div className="quest-choices" role="group" aria-label={question}>
            {QUEST_MOTIVES.map((motive) => (
              <button
                aria-pressed={chosen.includes(motive)}
                className={chosen.includes(motive) ? "quest-choice selected" : "quest-choice"}
                disabled={saving}
                key={motive}
                type="button"
                onClick={() => toggle(motive)}
              >
                {t(`quests.firstStep.option.${motive}` as MessageKey)}
              </button>
            ))}
          </div>
          {chosen.includes("own") ? (
            <div className="quest-own">
              <textarea maxLength={MOTIVE_NOTE_MAX} placeholder={t("quests.firstStep.ownPlaceholder")} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          ) : null}
          <button className="challenge-primary-action" type="button" disabled={saving || chosen.length === 0 || needsNote} onClick={() => void save()}>
            {saving ? t("app.common.loading") : t("quests.firstStep.save")}
          </button>
        </>
      ) : (
        <>
          <p className="quest-scene-text"><strong>{t("quests.firstStep.summaryTitle")}</strong></p>
          <ul className="quest-goals">
            {chosen.map((motive) => (
              <li key={motive}>
                <span>{label(motive)}</span>
                {motive !== "own" && (peers?.[motive] ?? 0) > 0 ? <small>{t("quests.firstStep.peers", { count: peers?.[motive] ?? 0 })}</small> : null}
              </li>
            ))}
          </ul>
          <NovaBubble text={t(`quests.firstStep.reply.${chosen[0]}` as MessageKey)} t={t} />
          <p className="quest-scene-text">{t("quests.firstStep.hook")}</p>
          <button className="challenge-primary-action" type="button" onClick={() => onAnswered(chosen)}>
            {t("quests.firstStep.claim")}
          </button>
        </>
      )}
      {error ? <p className="challenge-error">{error}</p> : null}
    </section>
  );
}

function inTelegramMiniApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData);
}

/**
 * "Install the app": the install steps until the app runs from the home screen, then a push code that only the
 * installed app can ask for. Inside Telegram the app cannot be installed, so the scene sends the person to a browser.
 */
export function AppInstalledQuest({ challengeId, locale, t, onCodeChange }: { challengeId: string; locale: string; t: TFunction; onCodeChange: (code: string) => void }) {
  const [standalone, setStandalone] = useState(false);
  const [telegram, setTelegram] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setTelegram(inTelegramMiniApp());
    setDesktop(!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    const update = () => setInstallPromptAvailable(canPromptPwaInstall());
    update();
    return subscribeToPwaInstallPrompt(update);
  }, []);

  function openInBrowser() {
    const url = `${window.location.origin}/?view=challenges`;
    const webApp = (window as unknown as { Telegram?: { WebApp?: { openLink?: (link: string) => void } } }).Telegram?.WebApp;
    if (webApp?.openLink) webApp.openLink(url);
    else window.open(url, "_blank", "noopener");
  }

  // On a computer browser notifications are enough; the phone install is offered there, not required.
  const ready = standalone || (desktop && !telegram);

  return (
    <section className="quest-channel">
      <ol className="quest-steps">
        <li className={ready ? "done" : "current"}>{standalone ? t("quests.install.step1Done") : ready ? t("quests.install.step1Desktop") : t("quests.install.step1")}</li>
        <li className={ready ? "current" : ""}>{t("quests.install.step2")}</li>
      </ol>
      {!ready && telegram ? (
        <>
          <p className="challenge-note">{t("quests.install.telegram")}</p>
          <button className="secondary-button" type="button" onClick={openInBrowser}>{t("quests.install.openBrowser")}</button>
        </>
      ) : null}
      {!ready ? (
        <>
          <InstallGuideDetails installPromptAvailable={installPromptAvailable} isDesktop={desktop} locale={locale} t={t} onInstall={() => { void promptPwaInstall(); }} />
          <p className="challenge-note">{t("quests.install.openFromIcon")}</p>
        </>
      ) : (
        <ChannelCodeChallenge challengeId={challengeId} channel="push" standalone={ready} t={t} onCodeChange={onCodeChange} />
      )}
    </section>
  );
}

export type PathMapItem = { id: string; step: number; title: string; state: "done" | "active" | "taken" | "skipped" | "open" | "locked" };

/** The path as a list: number, title and state of each step shown; locked steps keep their title as a teaser. When
 * nothing is ahead any more, it points to the side quests. */
export function PathMap({ items, t }: { items: PathMapItem[]; t: TFunction }) {
  return (
    <ol className="quest-path-map">
      {items.map((item) => (
        <li className={`quest-path-item ${item.state}`} key={item.id}>
          <span className="quest-path-num" aria-hidden="true">{item.state === "done" ? "✓" : item.step}</span>
          <span className="quest-path-title">{item.title}</span>
          <small>{t(`quests.path.state.${item.state}` as MessageKey)}</small>
        </li>
      ))}
      {items.every((item) => item.state !== "open" && item.state !== "locked") ? <li className="quest-path-item more">{t("quests.path.more")}</li> : null}
    </ol>
  );
}

// Leaf positions on the tree, in the order they appear as steps are done (viewBox 0 0 96 80).
const LEAVES: Array<[number, number]> = [
  [48, 50], [40, 44], [56, 42], [34, 36], [62, 34], [46, 30], [28, 28], [68, 26], [52, 22], [38, 20], [60, 16], [48, 12], [30, 14], [66, 10]
];

/** A tree that grows a leaf for every finished path step; the next leaf is a bud. */
export function PathTree({ done, total }: { done: number; total: number }) {
  const shown = Math.min(LEAVES.length, Math.max(total, 1));
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const top = 64 - Math.round(ratio * 40);
  return (
    <svg aria-hidden="true" className="quest-tree" viewBox="0 0 96 80">
      <ellipse cx="48" cy="74" rx="34" ry="5" fill="rgba(126, 226, 168, 0.25)" />
      <path d={`M48 74 C47 66 49 ${top + 10} 48 ${top}`} stroke="#b88a5a" strokeLinecap="round" strokeWidth="4" fill="none" />
      {ratio > 0.25 ? <path d={`M48 ${Math.max(top + 14, 46)} L36 ${Math.max(top + 4, 38)}`} stroke="#b88a5a" strokeLinecap="round" strokeWidth="2.5" /> : null}
      {ratio > 0.4 ? <path d={`M48 ${Math.max(top + 10, 42)} L60 ${Math.max(top + 2, 34)}`} stroke="#b88a5a" strokeLinecap="round" strokeWidth="2.5" /> : null}
      {LEAVES.slice(0, shown).map(([x, y], index) => {
        const leafY = Math.max(y, top - 6 + (index % 3) * 4);
        if (index < done) return <circle cx={x} cy={leafY} fill="#7ee2a8" key={index} r="5.5" />;
        if (index === done) return <circle className="quest-tree-bud" cx={x} cy={leafY} fill="#ffd66b" key={index} r="3" />;
        return null;
      })}
    </svg>
  );
}

const PLAN_TERMS = [1, 3, 5, 10] as const;

/**
 * "Work out the path to your wish": price of the wish and a term give the daily goal, Core at the end of the term and
 * its daily income. Saving creates the Core growth plan, which also becomes the person's goal for the day.
 */
export function GoalPlanQuest({ coreBalance, locale, t, onSaved }: { coreBalance: number; locale: AppLocale; t: TFunction; onSaved: () => void }) {
  const [price, setPrice] = useState("");
  const [wishTitle, setWishTitle] = useState<string | null>(null);
  const [years, setYears] = useState<(typeof PLAN_TERMS)[number]>(3);
  const [saving, setSaving] = useState(false);
  const [savedDaily, setSavedDaily] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth("/api/wishes?status=active&includeRecommended=false", { cache: "no-store" }, { authRequired: true });
        const payload = (await response.json().catch(() => ({}))) as { wishes?: Array<{ title?: string; target_amount?: number | null }> };
        const wish = (payload.wishes ?? []).find((item) => Number(item.target_amount ?? 0) > 0);
        if (mounted && wish) {
          setWishTitle(wish.title ?? null);
          setPrice((current) => current || String(Math.round(Number(wish.target_amount))));
        }
      } catch {
        // No wish price: the person types it.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const target = Math.max(0, Number(price.replace(",", ".")) || 0);
  const days = Math.round(years * 365.25);
  const start = Math.max(0, coreBalance);
  const daily = useMemo(() => requiredDailyAddition(start, target, days), [start, target, days]);
  // The daily goal is rounded up to cents, so Core by the term is shown as the price itself, not a few dollars above it.
  const futureCore = target;
  const reached = target > 0 && start >= target;

  async function save() {
    if (target <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const planResponse = await fetchWithSupabaseAuth("/api/core/growth-plan", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calculatedDaysToGoal: days,
          dailyAdditions: daily,
          metadata: { source: "quest_goal_plan", term_years: years },
          reinvestPercent: 100,
          startCore: start,
          targetType: "core_amount",
          targetValue: target
        })
      }, { authRequired: true });
      const planPayload = (await planResponse.json().catch(() => ({}))) as { error?: string };
      if (!planResponse.ok || planPayload.error) throw new Error(planPayload.error ?? t("quests.plan.saveFailed"));
      await fetchWithSupabaseAuth("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationLogic: "calculate_time_to_goal", proofKey: "calculated" })
      }, { authRequired: true });
      setSavedDaily(daily);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("quests.plan.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="quest-plan">
      <label className="quest-plan-field">
        <span>{t("quests.plan.price")}</span>
        <input inputMode="decimal" placeholder="1000" value={price} onChange={(event) => setPrice(event.target.value.replace(/[^\d.,]/g, "").slice(0, 10))} />
        {wishTitle ? <small>{t("quests.plan.fromWish", { title: wishTitle })}</small> : null}
      </label>
      <div className="quest-plan-field">
        <span>{t("quests.plan.term")}</span>
        <div className="quest-tabs">
          {PLAN_TERMS.map((term) => (
            <button aria-pressed={years === term} className={years === term ? "quest-tab selected" : "quest-tab"} key={term} type="button" onClick={() => setYears(term)}>
              {t(`quests.plan.term${term}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>
      {target > 0 ? (
        reached ? <p className="challenge-note">{t("quests.plan.alreadyReached")}</p> : (
          <div className="quest-plan-result">
            <span><small>{t("quests.plan.dailyGoal")}</small><strong>{formatRoundedMoney(daily, locale)}</strong></span>
            <span><small>{t("quests.plan.futureCore")}</small><strong>{formatRoundedMoney(futureCore, locale)}</strong></span>
            <span><small>{t("quests.plan.futureIncome")}</small><strong>{formatRoundedMoney(futureCore * DAILY_CORE_RATE, locale)}</strong></span>
          </div>
        )
      ) : null}
      <p className="challenge-note">{t("quests.plan.note")}</p>
      {savedDaily === null ? (
        <button className="challenge-primary-action" type="button" disabled={saving || target <= 0} onClick={() => void save()}>
          {saving ? t("app.common.loading") : t("quests.plan.save")}
        </button>
      ) : <p className="challenge-note">{t("quests.plan.saved", { amount: formatRoundedMoney(savedDaily, locale) })}</p>}
      {error ? <p className="challenge-error">{error}</p> : null}
    </section>
  );
}

type LeadersPayload = {
  leaders?: Array<{ rank: number; name: string | null; avatarUrl: string | null; quests: number; isViewer: boolean }>;
  viewer?: { rank: number | null; quests: number | null } | null;
};

/** Leaders of the week (app/api/quests/leaders): shown to everyone, so the pace of others is visible. */
export function QuestLeaders({ refreshKey, t }: { refreshKey: number; t: TFunction }) {
  const [payload, setPayload] = useState<LeadersPayload | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth("/api/quests/leaders", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as LeadersPayload;
        if (mounted) setPayload(next);
      } catch {
        // No board is fine: it is a bonus, not a step.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  const leaders = payload?.leaders ?? [];
  if (leaders.length === 0) return null;
  return (
    <section className="quest-leaders" aria-label={t("quests.leaders.title")}>
      <header>
        <strong>{t("quests.leaders.title")}</strong>
        <small>{t("quests.leaders.note")}</small>
      </header>
      <ol>
        {leaders.map((leader) => (
          <li className={leader.isViewer ? "viewer" : undefined} key={leader.rank}>
            <span className="quest-leaders-rank">{leader.rank}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {leader.avatarUrl ? <img alt="" src={leader.avatarUrl} /> : <span className="quest-leaders-avatar" aria-hidden="true" />}
            <span className="quest-leaders-name">{leader.isViewer ? `${leader.name ?? ""} (${t("quests.leaders.you")})` : leader.name ?? "—"}</span>
            <small>{t("quests.leaders.count", { count: leader.quests })}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

type RecommendedWish = { id: string; title: Record<string, string> | string; estimated_cost?: string | null };

/**
 * "Choose your main wish": three ready wishes added in one tap, or the person's own in one line. Saving checks the
 * quest at once; the first wish becomes the main one (app/api/wishes).
 */
export function ChooseWishQuest({ locale, t, onSaved }: { locale: AppLocale; t: TFunction; onSaved: () => void }) {
  const [ideas, setIdeas] = useState<RecommendedWish[]>([]);
  const [own, setOwn] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth("/api/wishes?status=active", { cache: "no-store" }, { authRequired: true });
        const payload = (await response.json().catch(() => ({}))) as { recommendedWishes?: RecommendedWish[] };
        if (mounted) setIdeas((payload.recommendedWishes ?? []).slice(0, 3));
      } catch {
        // Without ideas the person writes their own.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const titleOf = (wish: RecommendedWish) => (typeof wish.title === "string" ? wish.title : wish.title[locale] ?? wish.title.en ?? Object.values(wish.title)[0] ?? "");

  async function add(key: string, body: Record<string, unknown>) {
    setSaving(key);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/wishes", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, ...body })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? t("quests.wish.saveFailed"));
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("quests.wish.saveFailed"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="quest-plan">
      {ideas.length ? (
        <div className="quest-plan-field">
          <span>{t("quests.wish.ideas")}</span>
          <div className="quest-wish-ideas">
            {ideas.map((wish) => (
              <button className="quest-wish-idea" disabled={saving !== null} key={wish.id} type="button" onClick={() => void add(wish.id, { sourceRecommendedWishId: wish.id })}>
                <span>{titleOf(wish)}</span>
                <b>{saving === wish.id ? t("app.common.loading") : "+"}</b>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <label className="quest-plan-field">
        <span>{t("quests.wish.own")}</span>
        <input maxLength={120} placeholder={t("quests.wish.ownPlaceholder")} value={own} onChange={(event) => setOwn(event.target.value)} />
      </label>
      <button className="challenge-primary-action" type="button" disabled={saving !== null || own.trim().length < 2} onClick={() => void add("own", { title: own.trim() })}>
        {saving === "own" ? t("app.common.loading") : t("quests.wish.save")}
      </button>
      {error ? <p className="challenge-error">{error}</p> : null}
    </section>
  );
}
