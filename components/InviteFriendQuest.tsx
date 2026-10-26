"use client";

import { Check, Copy, QrCode, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import InviteKit from "@/components/InviteKit";
import { referralRewardLines, type ReferralSummary } from "@/components/ReferralProgramSummary";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { trackProductEvent } from "@/lib/productAnalytics";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

const STEPS = ["story", "bonuses", "courage", "send", "help"] as const;
type Step = (typeof STEPS)[number];

/** Answers to "What would help you invite people?": they go to the daily analytics (section "Рефералы"). */
export const INVITE_HELP_OPTIONS = ["texts", "video", "bigger_bonus", "clearer", "who_to_invite", "shy", "no_time"] as const;

/** The 1, 5 and 10 invited quests (migration 20261026120000): the same reward each. */
const MILESTONE_QUESTS = 3;
const MILESTONE_CORE = 1;
const MILESTONE_WALLET = 0.1;

/**
 * "Invite a friend" as a step-by-step quest: a short story, every bonus with live amounts and what 10 people bring,
 * why there is nothing to be shy about, how to send the link (share, copy, QR in a live talk), and a one-tap question
 * on what would help. The step is remembered on this device; the quest itself completes when someone signs up.
 */
export default function InviteFriendQuest() {
  const { t, locale, user } = useUserContext();
  const storageKey = user ? `oa-invite-quest-step:${user.id}` : null;
  const [step, setStep] = useState<Step>("story");
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [helpAnswers, setHelpAnswers] = useState<string[]>([]);
  const [helpSent, setHelpSent] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved && (STEPS as readonly string[]).includes(saved)) setStep(saved as Step);
    } catch {
      // Starts from the story when storage is unavailable.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const [summaryResponse, linkResponse] = await Promise.all([
          fetchWithSupabaseAuth(`/api/referrals/summary?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true }),
          fetchWithSupabaseAuth(`/api/referrals/me?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true })
        ]);
        const summaryPayload = summaryResponse.ok ? ((await summaryResponse.json()) as ReferralSummary) : null;
        const linkPayload = (await linkResponse.json().catch(() => ({}))) as { appUrl?: string | null; url?: string | null };
        if (cancelled) return;
        setSummary(summaryPayload);
        setLink(linkPayload.appUrl ?? linkPayload.url ?? null);
      } catch {
        // The texts still work; amounts and the link show when they load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const go = useCallback((next: Step) => {
    setStep(next);
    trackProductEvent("invite_quest_step", { step: next });
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // The step is only a convenience.
    }
  }, [storageKey]);

  const money = (value: number) => formatAdaptiveMoney(value, locale);
  const index = STEPS.indexOf(step);
  const shareText = t("quests.invite.shareText");

  async function share() {
    if (!link) return;
    trackProductEvent("invite_shared", { via: "share", source: "quest" });
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Open Abundance", text: shareText, url: link });
        return;
      }
    } catch {
      // Cancelled: nothing to do.
      return;
    }
    await copy();
  }

  async function copy() {
    if (!link) return;
    trackProductEvent("invite_shared", { via: "copy", source: "quest" });
    try {
      await navigator.clipboard.writeText(`${shareText} ${link}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function toggleQr() {
    if (!qrOpen) trackProductEvent("invite_shared", { via: "qr", source: "quest" });
    setQrOpen((open) => !open);
  }

  function sendHelp() {
    trackProductEvent("invite_help_answer", { answers: helpAnswers.join(",") || null });
    setHelpSent(true);
  }

  const amounts = summary?.amounts;
  const example = amounts
    ? {
        core: 10 * (amounts.signupCore + amounts.activeCore * amounts.confirmedMultiplier + amounts.humanityCore) + MILESTONE_QUESTS * MILESTONE_CORE,
        wallet: 10 * (amounts.activeWallet * amounts.confirmedMultiplier + amounts.humanityWallet) + MILESTONE_QUESTS * MILESTONE_WALLET
      }
    : null;

  return (
    <section className="quest-scene invite-quest">
      <div className="quest-scene-art" aria-hidden="true"><span className={step === "help" ? "quest-star lit" : "quest-star"} /></div>
      <span className="quest-scene-step">{t("quests.invite.stepLabel", { step: index + 1, total: STEPS.length })} · {t(`quests.invite.${step}.title` as MessageKey)}</span>

      {step === "story" ? (
        <>
          <p className="quest-scene-text">{t("quests.invite.story.text")}</p>
          <button className="challenge-primary-action" type="button" onClick={() => go("bonuses")}>{t("quests.invite.story.next")}</button>
        </>
      ) : null}

      {step === "bonuses" ? (
        <>
          <p className="quest-scene-text">{t("quests.invite.bonuses.text")}</p>
          {amounts ? (
            <ul className="quest-goals">
              {referralRewardLines(amounts, money).map(([key, values]) => <li key={key}>{t(key, values)}</li>)}
              <li>{t("quests.invite.bonuses.quests", { core: money(MILESTONE_CORE), wallet: money(MILESTONE_WALLET) })}</li>
            </ul>
          ) : <p className="quest-scene-hint">{t("app.common.loading")}</p>}
          {example ? (
            <p className="quest-scene-text invite-quest-example">{t("quests.invite.bonuses.example", { core: money(example.core), wallet: money(example.wallet) })}</p>
          ) : null}
          <p className="quest-scene-hint">{t("quests.invite.bonuses.friend")}</p>
          {amounts && !summary?.viewerConfirmed ? <p className="quest-scene-hint">{t("quests.invite.bonuses.confirmHint")}</p> : null}
          <button className="challenge-primary-action" type="button" onClick={() => go("courage")}>{t("quests.invite.bonuses.next")}</button>
        </>
      ) : null}

      {step === "courage" ? (
        <>
          <p className="quest-scene-text">{t("quests.invite.courage.text")}</p>
          <p className="quest-scene-text"><strong>{t("quests.invite.courage.punch")}</strong></p>
          <button className="challenge-primary-action" type="button" onClick={() => go("send")}>{t("quests.invite.courage.next")}</button>
        </>
      ) : null}

      {step === "send" ? (
        <>
          <ul className="quest-goals">
            <li>{t("quests.invite.send.all")}</li>
            <li>{t("quests.invite.send.anywhere")}</li>
            <li>{t("quests.invite.send.qr")}</li>
          </ul>
          <p className="quest-scene-hint">{t("quests.invite.send.friend")}</p>
          {link ? <p className="quest-scene-hint invite-quest-link">{link}</p> : null}
          <div className="invite-quest-actions">
            <button className="challenge-primary-action" type="button" disabled={!link} onClick={() => void share()}><Share2 size={16} aria-hidden="true" /> {t("quests.invite.send.share")}</button>
            <button className="quest-path-toggle" type="button" disabled={!link} onClick={() => void copy()}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? t("quests.invite.send.copied") : t("quests.invite.send.copy")}</button>
            <button className="quest-path-toggle" type="button" disabled={!link} aria-expanded={qrOpen} onClick={toggleQr}><QrCode size={14} aria-hidden="true" /> {t("quests.invite.send.showQr")}</button>
          </div>
          {qrOpen && link ? (
            <div className="invite-quest-qr"><QRCodeSVG value={link} size={208} level="M" marginSize={2} /></div>
          ) : null}
          <InviteKit />
          <button className="quest-path-toggle" type="button" onClick={() => go("help")}>{t("quests.invite.send.next")}</button>
        </>
      ) : null}

      {step === "help" ? (
        helpSent ? (
          <p className="quest-scene-text">{t("quests.invite.help.thanks")}</p>
        ) : (
          <>
            <p className="quest-scene-text">{t("quests.invite.help.text")}</p>
            <div className="quest-choices" role="group" aria-label={t("quests.invite.help.text")}>
              {INVITE_HELP_OPTIONS.map((option) => (
                <button
                  aria-pressed={helpAnswers.includes(option)}
                  className={helpAnswers.includes(option) ? "quest-choice selected" : "quest-choice"}
                  key={option}
                  type="button"
                  onClick={() => setHelpAnswers((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]))}
                >
                  {t(`quests.invite.help.option.${option}` as MessageKey)}
                </button>
              ))}
            </div>
            <button className="challenge-primary-action" type="button" disabled={helpAnswers.length === 0} onClick={sendHelp}>{t("quests.invite.help.send")}</button>
            <button className="quest-path-toggle" type="button" onClick={() => go("send")}>{t("quests.invite.help.back")}</button>
          </>
        )
      ) : null}

      {index > 0 && step !== "help" ? (
        <button className="quest-path-toggle" type="button" onClick={() => go(STEPS[index - 1])}>{t("quests.invite.back")}</button>
      ) : null}
    </section>
  );
}
