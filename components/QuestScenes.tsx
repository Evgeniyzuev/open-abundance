"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { OPEN_AI_PROMPT_EVENT } from "@/lib/noteAiClient";
import { InstallGuideDetails } from "@/components/InstallGuide";
import { calculateFutureCore, coreRequiredForDailyIncome, DAILY_CORE_RATE, findDaysToTarget, formatDurationParts } from "@/lib/coreCalculator";
import { CORE_POWER_EXAMPLE, CORE_POWER_SEEN_EVENT, corePowerSeen, openCoreCalculatorForQuest } from "@/lib/corePowerQuest";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { isStandaloneDisplay } from "@/lib/installPing";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { canPromptPwaInstall, promptPwaInstall, subscribeToPwaInstallPrompt } from "@/lib/pwaInstall";
import { enableDailyPush, isPushSupported, registerPushDevice } from "@/lib/pushReminders";
import { ABUNDANCE_QUIZ_LOGIC, ABUNDANCE_QUIZ_PROOF, KNOWLEDGE_QUESTIONS, OPINION_QUESTIONS } from "@/lib/abundanceQuiz";
import { STAY_STEPS, type StayStep } from "@/lib/stayInTouch";
import { MOTIVE_NOTE_MAX, QUEST_MOTIVE_CHOICES, requiredDailyAddition, type QuestMotive } from "@/lib/questPath";
import { trackProductEvent } from "@/lib/productAnalytics";
import { playUiSound } from "@/lib/ui/sound";
import { readPrimaryWish, storePrimaryWish, type PrimaryWishSummary } from "@/lib/wishJourney";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { readInvitedBy, storeGuestQuest } from "@/lib/guestQuest";

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
 * "First step": the opening scene of the path. The person says why they are here with one tap (or writes their own
 * answer); the answer goes to the profile (app/api/challenges/progress) and steers which side quests come first. The
 * second scene sums it up, says how many others came for the same, and the reward is taken from there.
 */
export function FirstStepQuest({ art, guest = false, guestReward, question, savedMotives, t, onAnswered, onSaved }: { art?: { question: string; answer: string }; guest?: boolean; guestReward?: string; question: string; savedMotives?: QuestMotive[]; t: TFunction; onAnswered: (motives: QuestMotive[]) => void; onSaved?: () => void }) {
  // Answers already saved (played as a guest before sign-in, or a reload): the summary and the reward, not the question again.
  const [chosen, setChosen] = useState<QuestMotive[]>(savedMotives ?? []);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [peers, setPeers] = useState<Record<string, number> | null>(savedMotives?.length ? {} : null);
  const [invitedBy, setInvitedBy] = useState<string | null>(null);
  useEffect(() => {
    if (!guest) setInvitedBy(readInvitedBy());
  }, [guest]);
  const [error, setError] = useState<string | null>(null);
  const saved = peers !== null;
  const [writingOwn, setWritingOwn] = useState(false);

  async function save(motives: QuestMotive[], ownNote: string) {
    if (motives.length === 0 || (motives.includes("own") && !ownNote)) return;
    setChosen(motives);
    if (guest) {
      storeGuestQuest({ motives, note: motives.includes("own") ? ownNote : undefined });
      trackProductEvent("guest_quest_motive_chosen", { motives: motives.join(",") });
      setPeers({});
      onSaved?.();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationLogic: "first_step_motive", proofKey: "motive_chosen", motives, note: motives.includes("own") ? ownNote : undefined })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; motivePeers?: Record<string, number> };
      if (!response.ok || payload.error) throw new Error(payload.error ?? t("quests.firstStep.saveFailed"));
      setPeers(payload.motivePeers ?? {});
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("quests.firstStep.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const label = (motive: QuestMotive) => (motive === "own" && note.trim() ? note.trim() : t(`quests.firstStep.option.${motive}` as MessageKey));

  return (
    <section className="quest-scene">
      {art ? (
        // Picture screens (the guest's opening screen): a full-width picture per scene and no "scene 1 of 2" counter.
        <div className="quest-scene-art quest-scene-photo" aria-hidden="true"><Image alt="" fill sizes="(max-width: 620px) 100vw, 590px" src={saved ? art.answer : art.question} priority /></div>
      ) : (
        <>
          <div className="quest-scene-art" aria-hidden="true"><span className={saved ? "quest-star lit" : "quest-star"} /></div>
          <span className="quest-scene-step">{saved ? t("quests.firstStep.scene2") : t("quests.firstStep.scene1")}</span>
        </>
      )}
      {invitedBy && !saved ? <p className="quest-invited">{t("invite.welcome.title", { name: invitedBy })}. {t("invite.welcome.body")}</p> : null}
      {!saved ? (
        <>
          <p className="quest-scene-text">{question}</p>
          <div className="quest-choices" role="group" aria-label={question}>
            {QUEST_MOTIVE_CHOICES.map((motive) => (
              <button
                className={chosen.includes(motive) ? "quest-choice selected" : "quest-choice"}
                disabled={saving}
                key={motive}
                type="button"
                onClick={() => void save([motive], "")}
              >
                {t(`quests.firstStep.option.${motive}` as MessageKey)}
              </button>
            ))}
          </div>
          {writingOwn ? (
            <div className="quest-own">
              <textarea maxLength={MOTIVE_NOTE_MAX} placeholder={t("quests.firstStep.ownPlaceholder")} value={note} onChange={(event) => setNote(event.target.value)} />
              <button className="challenge-primary-action" type="button" disabled={saving || !note.trim()} onClick={() => void save(["own"], note.trim())}>
                {saving ? t("app.common.loading") : t("quests.firstStep.save")}
              </button>
            </div>
          ) : (
            <button className="quest-choice" type="button" disabled={saving} onClick={() => setWritingOwn(true)}>
              {t("quests.firstStep.option.own")}
            </button>
          )}
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
          <p className="quest-scene-text">{guest && guestReward ? <strong>{guestReward}</strong> : t("quests.firstStep.hook")}</p>
          <button className="challenge-primary-action" type="button" onClick={() => onAnswered(chosen)}>
            {guest ? t("quests.guest.next") : t("quests.firstStep.claim")}
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

const PUSH_TIMEOUT_MS = 20_000;

type TelegramStatus = { configured: boolean; linked: boolean; canWrite: boolean; botUrl: string | null };

/**
 * «Будем на связи» (path step 3, verification_logic app_installed): a wizard of three steps, each can be skipped: the
 * Telegram bot's Start, installing the app on the phone, notifications on in the app. Each step shows its reward
 * ($0.3 Core); the reward for the steps done is claimed at the end (app/api/challenges/check verifies each step on the
 * server). Taken again later, only the steps not rewarded yet are shown (lib/stayInTouch.ts).
 */
export function AppInstalledQuest({ locale, t, onClaim, claiming }: { locale: string; t: TFunction; onClaim: () => void; claiming: boolean }) {
  const [standalone, setStandalone] = useState(false);
  const [telegram, setTelegram] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [ios, setIos] = useState(false);
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false);
  const [bot, setBot] = useState<TelegramStatus | null>(null);
  const [push, setPush] = useState<"idle" | "busy" | "on" | "denied" | "unsupported" | "failed">("idle");
  const [rewarded, setRewarded] = useState<StayStep[] | null>(null);
  const [stepReward, setStepReward] = useState(0.3);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const isStandalone = isStandaloneDisplay();
    setStandalone(isStandalone);
    setTelegram(inTelegramMiniApp());
    setDesktop(!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    setIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));
    if (!isPushSupported()) setPush("unsupported");
    else if (Notification.permission === "denied") setPush("denied");
    else if (Notification.permission === "granted") void registerPushDevice().then((ok) => setPush(ok ? "on" : "idle"));
    // Opened inside the installed app: that is the proof of the install step.
    if (isStandalone) {
      void fetchWithSupabaseAuth("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationLogic: "app_installed", proofKey: "app_installed" })
      }, { authRequired: true }).catch(() => undefined);
    }
    const update = () => setInstallPromptAvailable(canPromptPwaInstall());
    update();
    return subscribeToPwaInstallPrompt(update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchWithSupabaseAuth("/api/challenges/stay-in-touch", { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { rewarded?: StayStep[]; stepReward?: number } | null) => {
        if (cancelled) return;
        setRewarded(payload?.rewarded ?? []);
        if (payload?.stepReward) setStepReward(payload.stepReward);
      })
      .catch(() => !cancelled && setRewarded([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchWithSupabaseAuth("/api/telegram/status", { cache: "no-store" }, { authRequired: true })
        .then((response) => (response.ok ? response.json() : null))
        .then((status: TelegramStatus | null) => {
          if (!cancelled && status?.configured) setBot(status);
        })
        .catch(() => undefined);
    };
    load();
    // Back from the bot after pressing Start: look again.
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function openInBrowser() {
    const url = `${window.location.origin}/?view=challenges`;
    const webApp = (window as unknown as { Telegram?: { WebApp?: { openLink?: (link: string) => void } } }).Telegram?.WebApp;
    if (webApp?.openLink) webApp.openLink(url);
    else window.open(url, "_blank", "noopener");
  }

  async function openBot() {
    trackProductEvent("notify_quest_step", { step: "telegram", linked: Boolean(bot?.linked) });
    if (bot?.linked && bot.botUrl) {
      window.open(bot.botUrl, "_blank", "noopener,noreferrer");
      return;
    }
    // Not linked yet: the one-time link opens the Mini App, which links the account and asks to let the bot write.
    const response = await fetchWithSupabaseAuth("/api/auth/telegram/link", { method: "POST", cache: "no-store" }, { authRequired: true }).catch(() => null);
    const payload = response?.ok ? ((await response.json()) as { url?: string }) : null;
    if (payload?.url) window.location.href = payload.url;
  }

  async function turnOn() {
    setPush("busy");
    try {
      // A browser without a reachable push service never answers the subscribe call; give up instead of spinning.
      const enabled = await Promise.race([enableDailyPush(), new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), PUSH_TIMEOUT_MS))]);
      if (!enabled) {
        setPush(Notification.permission === "denied" ? "denied" : "failed");
        return;
      }
      const registered = await registerPushDevice();
      setPush(registered ? "on" : "failed");
      trackProductEvent("notify_quest_step", { step: "push", ok: registered });
    } catch {
      setPush("failed");
    }
  }

  if (!rewarded) return <p className="challenge-note">{t("app.common.loading")}</p>;

  // On iPhone notifications come only to the app added to the home screen; Android and computers can use the browser.
  const iosBrowser = ios && !standalone && !telegram;
  const canTurnOn = !telegram && push !== "unsupported" && !iosBrowser;
  const steps = STAY_STEPS.filter((step) => !rewarded.includes(step));
  const isDone = (step: StayStep) => (step === "bot" ? Boolean(bot?.canWrite) : step === "app" ? standalone : push === "on");
  const money = (amount: number) => formatRoundedMoney(amount, locale as AppLocale);
  const doneSteps = steps.filter(isDone);
  const current = steps[index] ?? null;

  if (!current) {
    return (
      <section className="quest-channel">
        <p><b>{t("quests.stay.summary")}</b></p>
        <ul className="quest-steps">
          {steps.map((step) => (
            <li className={isDone(step) ? "done" : ""} key={step}>
              {t(`quests.stay.${step}.short` as MessageKey)} · {isDone(step) ? `+${money(stepReward)}` : t("quests.stay.skipped")}
            </li>
          ))}
        </ul>
        {doneSteps.length ? (
          <button className="challenge-primary-action" type="button" disabled={claiming} onClick={onClaim}>
            {claiming ? t("app.common.loading") : t("quests.stay.claim", { amount: money(stepReward * doneSteps.length) })}
          </button>
        ) : (
<p className="challenge-note">{t("quests.stay.nothingDone")}</p>
        )}
        {doneSteps.length && doneSteps.length < steps.length ? <p className="challenge-note">{t("quests.stay.later")}</p> : null}
        <button className="text-button" type="button" onClick={() => setIndex(0)}>{t("quests.stay.back")}</button>
      </section>
    );
  }

  const done = isDone(current);
  return (
    <section className="quest-channel">
      <p className="challenge-note">{t("quests.stay.stepOf", { step: index + 1, total: steps.length })} · <b>+{money(stepReward)}</b></p>
      <ol className="quest-steps">
        <li className={done ? "done" : "current"}>
          <b>{t(`quests.stay.${current}.title` as MessageKey)}</b>
          {done ? <span> {t(`quests.stay.${current}.done` as MessageKey)}</span> : null}
        </li>
      </ol>

      {current === "bot" && !done ? (
        bot ? (
          <button className="secondary-button" type="button" onClick={() => void openBot()}>
            {t(bot.linked ? "quests.notify.openBot" : "quests.notify.linkTelegram")}
          </button>
        ) : <p className="challenge-note">{t("quests.notify.noTelegram")}</p>
      ) : null}

      {current === "app" && !done ? (
        telegram ? (
          <>
            <p className="challenge-note">{t("quests.install.telegram")}</p>
            <button className="secondary-button" type="button" onClick={openInBrowser}>{t("quests.install.openBrowser")}</button>
          </>
        ) : (
          <>
            <InstallGuideDetails open installPromptAvailable={installPromptAvailable} isDesktop={desktop} locale={locale} t={t} onInstall={() => { void promptPwaInstall(); }} />
            <p className="challenge-note">{t("quests.stay.app.openFromIcon")}</p>
          </>
        )
      ) : null}

      {current === "push" && !done ? (
        <>
          {iosBrowser ? <p className="challenge-note">{t("quests.notify.iosFromIcon")}</p> : canTurnOn ? (
            <button className="challenge-primary-action" type="button" disabled={push === "busy"} onClick={() => void turnOn()}>
              {push === "busy" ? t("app.common.loading") : t("quests.notify.turnOn")}
            </button>
          ) : null}
          {telegram ? <p className="challenge-note">{t("quests.install.telegram")}</p> : null}
          {!iosBrowser && !telegram && push === "denied" ? <p className="challenge-error">{t("quests.notify.denied")}</p> : null}
          {push === "failed" ? <p className="challenge-error">{t("quests.notify.failed")}</p> : null}
          {!iosBrowser && !telegram && push === "unsupported" ? <p className="challenge-note">{t("quests.notify.unsupported")}</p> : null}
        </>
      ) : null}

      <div className="quest-tabs">
        {done ? (
          <button className="challenge-primary-action" type="button" onClick={() => setIndex(index + 1)}>{t("quests.stay.next")}</button>
        ) : (
          <button className="challenge-secondary-action" type="button" onClick={() => setIndex(index + 1)}>{t("quests.stay.skipStep")}</button>
        )}
      </div>
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

const CORE_POWER_REACTIONS = ["impressive", "nonsense", "unreal", "small", "explain"] as const;
const CORE_POWER_DAILY_CHIPS = [5, 10, 20, 50] as const;
type CorePowerStage = "intro" | "react" | "goal" | "done";

/**
 * "The power of Core" (founder's scenario, 2026-10-26): (1) the calculator in Wallet shows Core and income after 30
 * years of $10 a day; it marks the step by itself (lib/corePowerQuest.ts) and the person comes back here; (2) "How do
 * you like the sum?" in one tap; (3) their own goal, capital or monthly income, with a daily Core target that changes
 * the term; saving sets the daily goal. Nova closes the quest and the reward follows.
 */
export function CorePowerQuest({ coreBalance, locale, t, userId, onSaved }: { coreBalance: number; locale: AppLocale; t: TFunction; userId: string | null; onSaved: () => void }) {
  const [stage, setStage] = useState<CorePowerStage>("intro");
  const [reaction, setReaction] = useState<(typeof CORE_POWER_REACTIONS)[number] | null>(null);
  const [goalKind, setGoalKind] = useState<"capital" | "income">("capital");
  const [amount, setAmount] = useState("");
  const [daily, setDaily] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const sync = () => setStage((current) => (current === "intro" && corePowerSeen(userId) ? "react" : current));
    sync();
    window.addEventListener(CORE_POWER_SEEN_EVENT, sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(CORE_POWER_SEEN_EVENT, sync);
      window.removeEventListener("focus", sync);
    };
  }, [userId]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth("/api/wishes?status=active&includeRecommended=false", { cache: "no-store" }, { authRequired: true });
        const payload = (await response.json().catch(() => ({}))) as { wishes?: Array<{ target_amount?: number | null }> };
        const wish = (payload.wishes ?? []).find((item) => Number(item.target_amount ?? 0) > 0);
        if (mounted && wish) setAmount((current) => current || String(Math.round(Number(wish.target_amount))));
      } catch {
        // No wish price: the person types it.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // The goal was already set from this quest (reload, closed sheet): straight to the reward, not the reaction again.
  useEffect(() => {
    let mounted = true;
    void fetchWithSupabaseAuth("/api/core/growth-plan", { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { plan?: { metadata?: { source?: string } | null } | null } | null) => {
        if (mounted && payload?.plan?.metadata?.source === "quest_core_power") setStage("done");
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const example = useMemo(() => {
    const core = calculateFutureCore({ startCore: Math.max(0, coreBalance), dailyAdditions: CORE_POWER_EXAMPLE.dailyAdditions, reinvestPercent: CORE_POWER_EXAMPLE.reinvestPercent, days: CORE_POWER_EXAMPLE.termYears * 365.25 });
    return { core, yearIncome: core * DAILY_CORE_RATE * 365 };
  }, [coreBalance]);

  const value = Math.max(0, Number(amount.replace(",", ".")) || 0);
  const dailyValue = Math.max(0, Number(daily.replace(",", ".")) || 0);
  const targetCore = goalKind === "capital" ? value : coreRequiredForDailyIncome(value / 30.4375);
  const start = Math.max(0, coreBalance);
  const result = useMemo(
    () => (targetCore > 0 ? findDaysToTarget({ startCore: start, dailyAdditions: dailyValue, reinvestPercent: 100, days: 0, targetCore }) : null),
    [dailyValue, start, targetCore]
  );
  const term = result?.kind === "estimated" ? formatDurationParts(result.days) : null;

  function react(choice: (typeof CORE_POWER_REACTIONS)[number]) {
    setReaction(choice);
    trackProductEvent("core_power_reaction", { reaction: choice });
  }

  async function save() {
    if (!result || result.kind !== "estimated" || dailyValue <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const planResponse = await fetchWithSupabaseAuth("/api/core/growth-plan", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calculatedDaysToGoal: result.days,
          dailyAdditions: dailyValue,
          metadata: { source: "quest_core_power", goal_kind: goalKind, goal_value: value },
          reinvestPercent: 100,
          startCore: start,
          targetType: "core_amount",
          targetValue: targetCore
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
      trackProductEvent("core_power_goal_saved", { goal_kind: goalKind, daily: dailyValue });
      setStage("done");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("quests.plan.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="quest-scene">
      <span className="quest-scene-step">{t(`quests.corePower.stage.${stage}` as MessageKey)}</span>

      {stage === "intro" ? (
        <>
          <p className="quest-scene-text">{t("quests.corePower.intro")}</p>
          <ol className="quest-steps">
            <li>{t("quests.corePower.how1")}</li>
            <li>{t("quests.corePower.how2")}</li>
            <li>{t("quests.corePower.how3")}</li>
          </ol>
          <button className="challenge-primary-action" type="button" onClick={openCoreCalculatorForQuest}>{t("quests.corePower.openCalculator")}</button>
          <button className="quest-path-toggle" type="button" onClick={() => setStage("react")}>{t("quests.corePower.skipCalculator")}</button>
        </>
      ) : null}

      {stage === "react" ? (
        <>
          <p className="quest-scene-text">{t("quests.corePower.result", { core: formatRoundedMoney(example.core, locale), income: formatRoundedMoney(example.yearIncome, locale) })}</p>
          <p className="quest-scene-hint">{t("quests.corePower.resultNote")}</p>
          {reaction ? (
            <>
              <NovaBubble text={t(`quests.corePower.reply.${reaction}` as MessageKey)} t={t} />
              <button className="challenge-primary-action" type="button" onClick={() => setStage("goal")}>{t("quests.corePower.toGoal")}</button>
            </>
          ) : (
            <>
              <p className="quest-scene-text"><strong>{t("quests.corePower.question")}</strong></p>
              <div className="quest-choices" role="group" aria-label={t("quests.corePower.question")}>
                {CORE_POWER_REACTIONS.map((choice) => (
                  <button className="quest-choice" key={choice} type="button" onClick={() => react(choice)}>{t(`quests.corePower.option.${choice}` as MessageKey)}</button>
                ))}
              </div>
            </>
          )}
        </>
      ) : null}

      {stage === "goal" ? (
        <div className="quest-plan">
          <div className="quest-tabs" role="group" aria-label={t("quests.corePower.goalKind")}>
            {(["capital", "income"] as const).map((kind) => (
              <button aria-pressed={goalKind === kind} className={goalKind === kind ? "quest-tab selected" : "quest-tab"} key={kind} type="button" onClick={() => setGoalKind(kind)}>
                {t(`quests.corePower.kind.${kind}` as MessageKey)}
              </button>
            ))}
          </div>
          <label className="quest-plan-field">
            <span>{t(goalKind === "capital" ? "quests.corePower.capitalLabel" : "quests.corePower.incomeLabel")}</span>
            <input inputMode="decimal" placeholder={goalKind === "capital" ? "10000" : "300"} value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, "").slice(0, 10))} />
          </label>
          <div className="quest-plan-field">
            <span>{t("quests.corePower.dailyLabel")}</span>
            <div className="quest-tabs">
              {CORE_POWER_DAILY_CHIPS.map((chip) => (
                <button aria-pressed={dailyValue === chip} className={dailyValue === chip ? "quest-tab selected" : "quest-tab"} key={chip} type="button" onClick={() => setDaily(String(chip))}>
                  {formatRoundedMoney(chip, locale)}
                </button>
              ))}
            </div>
            <input inputMode="decimal" value={daily} onChange={(event) => setDaily(event.target.value.replace(/[^\d.,]/g, "").slice(0, 8))} />
          </div>
          {result ? (
            result.kind === "estimated" && term ? (
              <div className="quest-plan-result">
                <span><small>{t("quests.corePower.term")}</small><strong>{t("quests.corePower.termValue", { years: term.years, months: term.months })}</strong></span>
                <span><small>{t("quests.plan.futureCore")}</small><strong>{formatRoundedMoney(targetCore, locale)}</strong></span>
                <span><small>{t("quests.corePower.incomeMonth")}</small><strong>{formatRoundedMoney(targetCore * DAILY_CORE_RATE * 30.4375, locale)}</strong></span>
              </div>
            ) : <p className="challenge-note">{t(result.kind === "reached" ? "quests.plan.alreadyReached" : "quests.corePower.tooFar")}</p>
          ) : null}
          <p className="challenge-note">{t("quests.corePower.dailyNote")}</p>
          <button className="challenge-primary-action" type="button" disabled={saving || result?.kind !== "estimated" || dailyValue <= 0} onClick={() => void save()}>
            {saving ? t("app.common.loading") : t("quests.corePower.save")}
          </button>
          {error ? <p className="challenge-error">{error}</p> : null}
        </div>
      ) : null}

      {stage === "done" ? (
        <>
          <NovaBubble text={t("quests.corePower.final")} t={t} />
          <button className="challenge-primary-action" type="button" onClick={onSaved}>{t("quests.wish.claim")}</button>
        </>
      ) : null}
    </section>
  );
}

const CONTINUE_OPTIONS = ["clear_benefit", "bigger_rewards", "friends", "reminders", "simpler", "time"] as const;

/**
 * Day 3+: Nova asks once "What do you need to keep going?" (several answers and an optional line). The answers go to
 * the daily analytics; the line also goes to the feedback inbox (app/api/feedback).
 */
export function ContinueQuestion({ locale, t, userId, registeredAt }: { locale: AppLocale; t: TFunction; userId: string | null; registeredAt: string | null }) {
  const storageKey = userId ? `oa-continue-question:${userId}` : null;
  const [hidden, setHidden] = useState(true);
  const [answers, setAnswers] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!storageKey || !registeredAt) return;
    const age = Date.now() - Date.parse(registeredAt);
    let answered = false;
    try {
      answered = Boolean(window.localStorage.getItem(storageKey));
    } catch {
      answered = false;
    }
    setHidden(answered || !(age >= 2 * 86_400_000));
  }, [registeredAt, storageKey]);

  if (hidden) return null;

  function send() {
    trackProductEvent("quest_continue_answer", { answers: answers.join(",") || null, has_note: note.trim().length > 0 });
    if (note.trim().length >= 3) {
      void fetchWithSupabaseAuth("/api/feedback", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "idea", message: note.trim().slice(0, 2000), screen: "quests.continue", locale })
      }).catch(() => undefined);
    }
    try {
      if (storageKey) window.localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      // Asked again next time at worst.
    }
    setSent(true);
  }

  return (
    <section className="quest-scene quest-continue">
      <NovaBubble text={sent ? t("quests.continue.thanks") : t("quests.continue.question")} t={t} />
      {sent ? null : (
        <>
          <div className="quest-choices" role="group" aria-label={t("quests.continue.question")}>
            {CONTINUE_OPTIONS.map((option) => (
              <button
                aria-pressed={answers.includes(option)}
                className={answers.includes(option) ? "quest-choice selected" : "quest-choice"}
                key={option}
                type="button"
                onClick={() => setAnswers((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]))}
              >
                {t(`quests.continue.option.${option}` as MessageKey)}
              </button>
            ))}
          </div>
          <div className="quest-own">
            <textarea maxLength={500} placeholder={t("quests.continue.notePlaceholder")} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <button className="challenge-primary-action" type="button" disabled={answers.length === 0 && note.trim().length < 3} onClick={send}>{t("quests.continue.send")}</button>
        </>
      )}
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

/** The five simple wishes of "First wish": a price for the next quest's calculation and Nova's reaction. */
export const FIRST_WISHES = [
  { key: "smartphone", price: 800, motive: "wish" },
  { key: "income", price: 0, motive: "income" },
  { key: "travel", price: 1500, motive: "change" },
  { key: "course", price: 500, motive: "learn" },
  { key: "health", price: 400, motive: "path" }
] as const;
type FirstWish = (typeof FIRST_WISHES)[number];

/**
 * "First wish": five simple wishes in one tap (the one matching the person's answer in "First step" goes first) or
 * their own in one line. Nova reacts to the choice, and the reward is taken from there. The first wish becomes the main
 * one on this device (lib/wishJourney.ts), so Home shows it right away.
 */
export function ChooseWishQuest({ guest = false, locale, motives, t, userId, onSaved }: { guest?: boolean; locale: AppLocale; motives?: string[]; t: TFunction; userId: string | null; onSaved: () => void }) {
  const [own, setOwn] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reaction, setReaction] = useState<string | null>(null);
  const cards = useMemo(() => {
    const first = motives?.[0];
    return [...FIRST_WISHES].sort((a, b) => Number(b.motive === first) - Number(a.motive === first));
  }, [motives]);

  // Coming back after a wish is already saved (reload, closed sheet): Nova's reaction and the reward, not the picker
  // again, so the same wish is not added twice.
  useEffect(() => {
    if (guest) return;
    let cancelled = false;
    void fetchWithSupabaseAuth("/api/wishes?status=active&includeRecommended=false", { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { wishes?: PrimaryWishSummary[] } | null) => {
        const wish = payload?.wishes?.[0];
        const title = wish?.title?.trim();
        if (cancelled || !wish || !title) return;
        if (userId && !readPrimaryWish(userId)) storePrimaryWish(userId, wish);
        const known = FIRST_WISHES.find((wish) => t(`quests.wish.card.${wish.key}` as MessageKey) === title);
        setReaction((current) => current ?? (known ? t(`quests.wish.react.${known.key}` as MessageKey) : t("quests.wish.react.own", { title })));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [guest, t, userId]);

  async function add(key: string, body: Record<string, unknown>, nextReaction: string) {
    if (guest) {
      const targetAmount = typeof body.targetAmount === "number" ? body.targetAmount : undefined;
      storeGuestQuest({ wish: { key, title: String(body.title ?? ""), ...(targetAmount ? { targetAmount } : {}) } });
      trackProductEvent("guest_quest_wish_chosen", { wish: key });
      setReaction(nextReaction);
      return;
    }
    setSaving(key);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/wishes", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, ...body })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; wish?: PrimaryWishSummary };
      if (!response.ok || payload.error) throw new Error(payload.error ?? t("quests.wish.saveFailed"));
      if (userId && payload.wish && !readPrimaryWish(userId)) storePrimaryWish(userId, payload.wish);
      trackProductEvent("first_wish_chosen", { wish: key });
      setReaction(nextReaction);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("quests.wish.saveFailed"));
    } finally {
      setSaving(null);
    }
  }

  function pick(wish: FirstWish) {
    const title = t(`quests.wish.card.${wish.key}` as MessageKey);
    void add(wish.key, { title, ...(wish.price > 0 ? { targetAmount: wish.price, targetCurrency: "USD" } : {}) }, t(`quests.wish.react.${wish.key}` as MessageKey));
  }

  if (reaction) {
    return (
      <section className="quest-plan">
        <NovaBubble text={`${reaction} ${t("quests.wish.reactNext")}`} t={t} />
        <button className="challenge-primary-action" type="button" onClick={onSaved}>{guest ? t("quests.guest.save") : t("quests.wish.claim")}</button>
      </section>
    );
  }

  return (
    <section className="quest-plan">
      <div className="quest-plan-field">
        <span>{t("quests.wish.ideas")}</span>
        <div className="quest-wish-ideas">
          {cards.map((wish) => (
            <button className="quest-wish-idea" disabled={saving !== null} key={wish.key} type="button" onClick={() => pick(wish)}>
              <span>{t(`quests.wish.card.${wish.key}` as MessageKey)}</span>
              <b>{saving === wish.key ? t("app.common.loading") : wish.price > 0 ? formatRoundedMoney(wish.price, locale) : "+"}</b>
            </button>
          ))}
        </div>
      </div>
      <label className="quest-plan-field">
        <span>{t("quests.wish.own")}</span>
        <input maxLength={120} placeholder={t("quests.wish.ownPlaceholder")} value={own} onChange={(event) => setOwn(event.target.value)} />
      </label>
      <button className="challenge-primary-action" type="button" disabled={saving !== null || own.trim().length < 2} onClick={() => void add("own", { title: own.trim() }, t("quests.wish.react.own", { title: own.trim() }))}>
        {saving === "own" ? t("app.common.loading") : t("quests.wish.save")}
      </button>
      {error ? <p className="challenge-error">{error}</p> : null}
    </section>
  );
}

const QUIZ_STORE_KEY = "oa.abundanceQuiz";
const REEL_SYMBOLS = ["🍀", "⭐", "💎", "🌱", "🎁", "🚀"];
const QUIZ_TOTAL = KNOWLEDGE_QUESTIONS.length + OPINION_QUESTIONS.length;

/** Ten dots over the quiz: done, current, ahead; coins on the dots answered right on the first try. */
function QuizDots({ step, wins }: { step: number; wins: boolean[] }) {
  return (
    <div className="quiz-dots" aria-hidden="true">
      {[...Array(QUIZ_TOTAL)].map((_, i) => (
        <span className={i < step ? "done" : i === step ? "current" : ""} key={i}>{wins[i] ? "💰" : ""}</span>
      ))}
    </div>
  );
}

/** A few coins flying up from the middle of the card. */
function CoinBurst({ count, label }: { count: number; label?: string }) {
  return (
    <div className="quiz-burst" aria-hidden="true">
      {[...Array(count)].map((_, i) => (
        <span key={i} style={{ left: `${10 + ((i * 37) % 80)}%`, animationDelay: `${(i % 6) * 0.08}s` }}>💰</span>
      ))}
      {label ? <b>{label}</b> : null}
    </div>
  );
}

/**
 * «Про изобилие» (verification_logic abundance_quiz, lib/abundanceQuiz.ts): five knowledge cards (a wrong answer opens
 * a one-card lesson and the person answers again; only the first answer counts), a slot machine where a coin drops for
 * each first-try right answer, then five opinion cards (the future one shows a piece of lore). The answers are graded
 * on the server; the reward is claimed at the end. Game feel: progress dots, coin bursts, a shake on a miss, a lever.
 */
export function AbundanceQuiz({ locale, t, onClaim, claiming }: { locale: string; t: TFunction; onClaim: () => void; claiming: boolean }) {
  const lang = locale === "ru" ? "ru" : "en";
  const [first, setFirst] = useState<Record<string, string>>({});
  const [opinions, setOpinions] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [phase, setPhase] = useState<"knowledge" | "reels" | "opinions" | "done">("knowledge");
  const [spun, setSpun] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // The first answers survive a reload, so leaving after a lesson does not give a second first try.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(QUIZ_STORE_KEY) ?? "{}") as { first?: Record<string, string> };
      if (saved.first) setFirst(saved.first);
    } catch {
      // Starts from the beginning.
    }
  }, []);

  function rememberFirst(next: Record<string, string>) {
    setFirst(next);
    try {
      window.localStorage.setItem(QUIZ_STORE_KEY, JSON.stringify({ first: next }));
    } catch {
      // Kept in memory only.
    }
  }

  const wins = KNOWLEDGE_QUESTIONS.map((question) => first[question.id] === question.correct);
  const rightCount = wins.filter(Boolean).length;
  const perAnswer = 1 / KNOWLEDGE_QUESTIONS.length;
  const money = (amount: number) => formatRoundedMoney(amount, lang as AppLocale);

  async function save(finalOpinions: Record<string, string>) {
    setSaving(true);
    setError(false);
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationLogic: ABUNDANCE_QUIZ_LOGIC, proofKey: ABUNDANCE_QUIZ_PROOF, answers: first, opinions: finalOpinions })
      }, { authRequired: true });
      if (!response.ok) throw new Error("save failed");
      try {
        window.localStorage.removeItem(QUIZ_STORE_KEY);
      } catch {
        // Nothing to clear.
      }
      setPhase("done");
      if (rightCount) playUiSound("reward");
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (phase === "knowledge") {
    const question = KNOWLEDGE_QUESTIONS[index];
    const firstAnswer = first[question.id];
    const right = picked === question.correct;
    const wrong = picked !== null && !right;
    const firstTry = right && firstAnswer === question.correct;
    return (
      <section className="quest-channel quiz-card">
        <QuizDots step={index} wins={wins.map((win, i) => win && i < index)} />
        <div className={`quiz-art${right ? " pop" : ""}`} aria-hidden="true">{question.art}</div>
        <p className="quiz-question">{question.question[lang]}</p>
        <div className="quiz-options">
          {question.options.map((option) => (
            <button
              className={`quiz-option${picked === option.id ? (right ? " right" : " wrong") : ""}`}
              disabled={right}
              key={`${option.id}-${picked === option.id ? "on" : "off"}`}
              type="button"
              onClick={() => {
                setPicked(option.id);
                if (!firstAnswer) rememberFirst({ ...first, [question.id]: option.id });
                playUiSound(option.id === question.correct ? "correct" : "wrong");
              }}
            >
              {option.text[lang]}
            </button>
          ))}
        </div>
        {firstTry ? <CoinBurst count={6} label={`+${money(perAnswer)}`} /> : null}
        {wrong ? (
          <div className="quiz-lesson">
            <b>💡 {t("quests.abundance.lesson")}</b>
            <p>{question.lesson[lang]}</p>
            <small>{t("quests.abundance.tryAgain")}</small>
          </div>
        ) : null}
        {right ? (
          <>
            <p className="quiz-right">{firstTry ? t("quests.abundance.rightFirst") : t("quests.abundance.right")}</p>
            <button
              className="challenge-primary-action"
              type="button"
              onClick={() => {
                setPicked(null);
                if (index + 1 < KNOWLEDGE_QUESTIONS.length) setIndex(index + 1);
                else {
                  setIndex(0);
                  setPhase("reels");
                }
              }}
            >
              {index + 1 < KNOWLEDGE_QUESTIONS.length ? t("quests.stay.next") : t("quests.abundance.toReels")}
            </button>
          </>
        ) : null}
      </section>
    );
  }

  if (phase === "reels") {
    return (
      <section className="quest-channel quiz-card">
        <p className="quiz-question">{t("quests.abundance.reelsTitle")}</p>
        <div className="quiz-machine">
          <div className="quiz-reels">
            {KNOWLEDGE_QUESTIONS.map((question, reel) => {
              const strip = [...Array(10)].map((_, i) => REEL_SYMBOLS[(i + reel * 2) % REEL_SYMBOLS.length]);
              return (
                <div className="quiz-reel" key={question.id}>
                  <div className={`quiz-reel-strip${spun ? " spin" : ""}`} style={{ animationDelay: `${reel * 0.35}s` }}>
                    {spun ? strip.map((symbol, i) => <span key={i}>{symbol}</span>) : null}
                    <span className={spun ? (wins[reel] ? "hit" : "miss") : "idle"}>{spun ? (wins[reel] ? "💰" : "—") : "❔"}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {!spun ? (
            <button
              className="quiz-lever"
              type="button"
              onClick={() => {
                setSpun(true);
                playUiSound("action");
                window.setTimeout(() => playUiSound(rightCount ? "reward" : "action"), 1400 + KNOWLEDGE_QUESTIONS.length * 350);
              }}
            >
              🎰 {t("quests.abundance.spin")}
            </button>
          ) : null}
        </div>
        {spun ? (
          <div className="quiz-reel-result">
            {rightCount ? <CoinBurst count={rightCount * 3} /> : null}
            <p className="quiz-right">{rightCount ? t("quests.abundance.reelsWin", { count: rightCount, amount: money(rightCount * perAnswer) }) : t("quests.abundance.reelsEmpty")}</p>
            <p className="challenge-note">{t("quests.abundance.reelsNext")}</p>
            <button className="challenge-primary-action" type="button" onClick={() => setPhase("opinions")}>{t("quests.stay.next")}</button>
          </div>
        ) : null}
      </section>
    );
  }

  if (phase === "opinions") {
    const question = OPINION_QUESTIONS[index];
    const answer = opinions[question.id];
    const lore = answer && question.lore ? question.lore[answer] : null;
    const last = index + 1 >= OPINION_QUESTIONS.length;
    return (
      <section className="quest-channel quiz-card">
        <QuizDots step={KNOWLEDGE_QUESTIONS.length + index} wins={wins} />
        <p className="challenge-note">🗳️ {t("quests.abundance.opinion")}</p>
        <div className="quiz-art" aria-hidden="true">{question.art}</div>
        <p className="quiz-question">{question.question[lang]}</p>
        <div className="quiz-options">
          {question.options.map((option) => (
            <button className={`quiz-option${answer === option.id ? " right" : ""}`} key={option.id} type="button" onClick={() => { setOpinions({ ...opinions, [question.id]: option.id }); playUiSound("action"); }}>
              {option.text[lang]}
            </button>
          ))}
        </div>
        {lore ? <div className="quiz-lesson quiz-lore"><b>🌍 {t("quests.abundance.lore")}</b><p>{lore[lang]}</p></div> : null}
        {answer ? (
          <button
            className="challenge-primary-action"
            disabled={saving}
            type="button"
            onClick={() => {
              if (!last) setIndex(index + 1);
              else void save(opinions);
            }}
          >
            {saving ? t("app.common.loading") : last ? t("quests.abundance.finish") : t("quests.stay.next")}
          </button>
        ) : null}
        {error ? <p className="challenge-error">{t("quests.abundance.saveFailed")}</p> : null}
      </section>
    );
  }

  return (
    <section className="quest-channel quiz-card">
      <QuizDots step={QUIZ_TOTAL} wins={wins} />
      {rightCount ? <CoinBurst count={12} label={`+${money(rightCount * perAnswer)}`} /> : null}
      <div className="quiz-art pop" aria-hidden="true">🌍</div>
      <p className="quiz-question">{t("quests.abundance.thanks")}</p>
      <button className="challenge-primary-action" type="button" disabled={claiming} onClick={onClaim}>
        {claiming ? t("app.common.loading") : rightCount ? t("quests.stay.claim", { amount: money(rightCount * perAnswer) }) : t("quests.abundance.close")}
      </button>
    </section>
  );
}
