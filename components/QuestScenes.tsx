"use client";

import { useEffect, useMemo, useState } from "react";
import ChannelCodeChallenge from "@/components/ChannelCodeChallenge";
import { DAILY_CORE_RATE } from "@/lib/coreCalculator";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { MOTIVE_NOTE_MAX, QUEST_MOTIVES, requiredDailyAddition, type QuestMotive } from "@/lib/questPath";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

/** Nova's line for a quest: one per path quest, a general one otherwise. */
export function novaLine(verificationLogic: string | null | undefined, t: TFunction): string {
  const key = `quests.nova.${verificationLogic ?? ""}` as MessageKey;
  const line = t(key);
  return line === key ? t("quests.nova.default") : line;
}

export function NovaBubble({ text, t }: { text: string; t: TFunction }) {
  return (
    <div className="quest-nova">
      <img alt="" className="quest-nova-avatar" src="/nova-fox-robot.webp" />
      <p><strong>{t("quests.nova.name")}</strong>{text}</p>
    </div>
  );
}

/**
 * "First step": the opening scene of the path. The person says why they are here; the answer goes to the profile
 * (app/api/challenges/progress) and steers which side quests come first. Then the quest checks itself.
 */
export function FirstStepQuest({ question, t, onAnswered }: { question: string; t: TFunction; onAnswered: (motive: QuestMotive) => void }) {
  const [choice, setChoice] = useState<QuestMotive | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(motive: QuestMotive) {
    if (motive === "own" && !note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/progress", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationLogic: "first_step_motive", proofKey: "motive_chosen", motive, note: motive === "own" ? note.trim() : undefined })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? t("quests.firstStep.saveFailed"));
      setSaved(true);
      onAnswered(motive);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("quests.firstStep.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="quest-scene">
      <div className="quest-scene-art" aria-hidden="true"><span className={saved ? "quest-star lit" : "quest-star"} /></div>
      <span className="quest-scene-step">{saved ? t("quests.firstStep.scene2") : t("quests.firstStep.scene1")}</span>
      {!saved ? (
        <>
          <p className="quest-scene-text">{question}</p>
          <div className="quest-choices" role="radiogroup" aria-label={question}>
            {QUEST_MOTIVES.map((motive) => (
              <button
                aria-checked={choice === motive}
                className={choice === motive ? "quest-choice selected" : "quest-choice"}
                disabled={saving}
                key={motive}
                role="radio"
                type="button"
                onClick={() => {
                  setChoice(motive);
                  if (motive !== "own") void save(motive);
                }}
              >
                {t(`quests.firstStep.option.${motive}` as MessageKey)}
              </button>
            ))}
          </div>
          {choice === "own" ? (
            <div className="quest-own">
              <textarea maxLength={MOTIVE_NOTE_MAX} placeholder={t("quests.firstStep.ownPlaceholder")} value={note} onChange={(event) => setNote(event.target.value)} />
              <button className="challenge-primary-action" type="button" disabled={saving || !note.trim()} onClick={() => void save("own")}>
                {saving ? t("app.common.loading") : t("quests.firstStep.save")}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {choice && saved ? <NovaBubble text={t(`quests.firstStep.reply.${choice}` as MessageKey)} t={t} /> : null}
      {saved ? <p className="quest-scene-text">{t("quests.firstStep.hook")}</p> : null}
      {error ? <p className="challenge-error">{error}</p> : null}
    </section>
  );
}

function inTelegramMiniApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData);
}

/** "Stay in touch with Nova": a code through push in a browser or the installed app, through the bot in Telegram. */
export function ChannelConnectedQuest({ challengeId, t, onCodeChange }: { challengeId: string; t: TFunction; onCodeChange: (code: string) => void }) {
  const [channel, setChannel] = useState<"push" | "telegram">("push");
  useEffect(() => {
    if (inTelegramMiniApp()) setChannel("telegram");
  }, []);

  return (
    <section className="quest-channel">
      <div className="quest-tabs" role="tablist">
        {(["push", "telegram"] as const).map((option) => (
          <button aria-selected={channel === option} className={channel === option ? "quest-tab selected" : "quest-tab"} key={option} role="tab" type="button" onClick={() => setChannel(option)}>
            {t(`quests.channel.${option}` as MessageKey)}
          </button>
        ))}
      </div>
      <p className="challenge-note">{channel === "push" ? t("quests.channel.pushHint") : t("quests.channel.telegramHint")}</p>
      <ChannelCodeChallenge challengeId={challengeId} channel={channel} key={channel} t={t} onCodeChange={onCodeChange} />
    </section>
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
