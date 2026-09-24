"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { translate, type AppLocale, type MessageKey } from "@/lib/i18n";
import { formatRoundedMoney } from "@/lib/moneyFormat";

type Challenge = { core_reward_amount: number; id: string; wallet_reward_amount: number };
type Source = {
  canonical_url?: string | null;
  platform?: string | null;
  title?: string | null;
  body_excerpt?: string | null;
  cover_url?: string | null;
  referral_url?: string | null;
  metric_key?: string | null;
  metric_value?: number | null;
  metric_evidence_url?: string | null;
};
type Current = {
  answer: { id: string; status: "offered" | "accepted" | "submitted"; verdict?: "pass" | "fail" | null; checklist?: Record<string, boolean> | null; notes?: string | null };
  task: { acquisition_submissions?: Source | null; due_at?: string | null };
};
type Progress = { accepted: boolean; reviewsCompleted: number; validReviews: number; invalidReviews: number; nextRewardBlocked: boolean };

const checklistKeys = [
  ["url_accessible", "peerReviews.urlAccessible"],
  ["allowed_platform", "peerReviews.allowedPlatform"],
  ["visual_cover", "peerReviews.visualCover"],
  ["title_context", "peerReviews.titleContext"],
  ["referral_link", "peerReviews.referralLink"],
  ["no_spam", "peerReviews.noSpam"]
] as const;

type ActionBody = { action: "next" | "accept" | "decline" | "submit"; answerId?: string; checklist?: Record<string, boolean>; verdict?: "pass" | "fail"; notes?: string; declineReason?: string };

export default function PeerReviewsPanel({ challenge, locale }: { challenge: Challenge; locale: AppLocale }) {
  const t = (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values);
  const [current, setCurrent] = useState<Current | null>(null);
  const [progress, setProgress] = useState<Progress>({ accepted: false, reviewsCompleted: 0, validReviews: 0, invalidReviews: 0, nextRewardBlocked: false });
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [verdict, setVerdict] = useState<"pass" | "fail" | "">("");
  const [notes, setNotes] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const source = current?.task.acquisition_submissions ?? null;
  const isAccepted = current?.answer.status === "accepted";
  const isSubmitted = current?.answer.status === "submitted";
  const checklistComplete = checklistKeys.every(([key]) => typeof checklist[key] === "boolean");
  const progressText = t("peerReviews.progress", { completed: progress.reviewsCompleted, valid: progress.validReviews, invalid: progress.invalidReviews });
  const rewardAmount = Number(challenge.core_reward_amount) + Number(challenge.wallet_reward_amount);
  const rewardSummary = formatRewardSummary(challenge, locale);

  async function load() {
    const response = await fetchWithSupabaseAuth(`/api/challenges/peer-reviews?challenge=${challenge.id}&ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not load review task.");
    setCurrent(payload.current ?? null);
    setProgress(payload.progress ?? progress);
    if (payload.current?.answer?.checklist) setChecklist(payload.current.answer.checklist);
    if (payload.current?.answer?.verdict) setVerdict(payload.current.answer.verdict);
    if (payload.current?.answer?.notes) setNotes(payload.current.answer.notes);
  }

  // The task endpoint is intentionally refreshed only when the selected challenge changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load review task.")); }, [challenge.id]);

  async function act(body: ActionBody) {
    setBusy(true);
    setError("");
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/peer-reviews", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, { authRequired: true });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not update review.");
      setCurrent(payload.current ?? null);
      if (payload.progress) setProgress(payload.progress);
      if (body.action === "submit") {
        setMessage(payload.rewardStatus === "paid" ? t("challenges.rewardClaimed", { rewards: rewardSummary }) : payload.rewardStatus === "withheld" ? t("peerReviews.withheld", { penalty: formatRoundedMoney(rewardAmount, locale), reward: formatRoundedMoney(rewardAmount, locale) }) : t("peerReviews.submitted"));
        setChecklist({});
        setVerdict("");
        setNotes("");
      }
      if (body.action === "decline") {
        setDeclineReason("");
        setMessage("");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update review.");
    } finally {
      setBusy(false);
    }
  }

  function toggleChecklist(key: string, value: boolean) {
    setChecklist((currentValue) => ({ ...currentValue, [key]: value }));
  }

  return (
    <section className="peer-reviews-panel">
      <div className="peer-reviews-progress">
        <ShieldCheck aria-hidden="true" size={18} />
        <span>{progressText}</span>
        <strong>{rewardSummary}</strong>
      </div>
      {progress.nextRewardBlocked ? <p className="challenge-note">{t("peerReviews.rewardBlocked", { reward: rewardSummary })}</p> : null}

      {!current ? (
        <div className="peer-reviews-empty">
          <p>{t("peerReviews.noTasks")}</p>
          <button className="challenge-primary-action" type="button" disabled={busy} onClick={() => void act({ action: "next" })}>{busy ? "…" : t("peerReviews.getTask")}</button>
        </div>
      ) : (
        <>
          {source ? (
            <div className="peer-reviews-source">
              <div className="peer-reviews-source-heading"><strong>{t("peerReviews.source")}</strong>{source.canonical_url ? <a href={source.canonical_url} target="_blank" rel="noreferrer">{t("peerReviews.open")} <ExternalLink aria-hidden="true" size={14} /></a> : null}</div>
              {source.cover_url ? <img src={source.cover_url} alt="" loading="lazy" /> : null}
              {source.title ? <h4>{source.title}</h4> : null}
              {source.body_excerpt ? <p>{source.body_excerpt}</p> : null}
              <small>{source.platform}{source.metric_value != null ? ` · ${source.metric_key ?? "metric"}: ${source.metric_value}` : ""}</small>
            </div>
          ) : null}

          {isSubmitted ? <p className="challenge-note">{t("peerReviews.submitted")}</p> : !isAccepted ? (
            <div className="peer-reviews-actions">
              <button className="challenge-primary-action" type="button" disabled={busy} onClick={() => void act({ action: "accept", answerId: current.answer.id })}>{t("peerReviews.accept")}</button>
              <label>{t("peerReviews.declineReason")}<input value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} /></label>
              <button className="challenge-secondary-action" type="button" disabled={busy} onClick={() => void act({ action: "decline", answerId: current.answer.id, declineReason })}>{t("peerReviews.decline")}</button>
            </div>
          ) : (
            <div className="peer-reviews-form">
              <fieldset>
                <legend>{t("peerReviews.checklist")}</legend>
                {checklistKeys.map(([key, label]) => <label className="peer-reviews-check" key={key}><input type="checkbox" checked={checklist[key] === true} onChange={(event) => toggleChecklist(key, event.target.checked)} />{t(label)}</label>)}
              </fieldset>
              <fieldset>
                <legend>{t("peerReviews.verdict")}</legend>
                <div className="peer-reviews-verdicts">
                  <button className={verdict === "pass" ? "is-selected" : ""} type="button" onClick={() => setVerdict("pass")}>{t("peerReviews.pass")}</button>
                  <button className={verdict === "fail" ? "is-selected" : ""} type="button" onClick={() => setVerdict("fail")}>{t("peerReviews.fail")}</button>
                </div>
              </fieldset>
              <label>{t("peerReviews.notes")}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              <div className="peer-reviews-actions">
                <button className="challenge-primary-action" type="button" disabled={busy || !checklistComplete || !verdict || notes.trim().length < 8} onClick={() => void act({ action: "submit", answerId: current.answer.id, checklist, verdict: verdict || undefined, notes })}>{busy ? "…" : t("peerReviews.submit")}</button>
                <button className="challenge-secondary-action" type="button" disabled={busy} onClick={() => void act({ action: "decline", answerId: current.answer.id, declineReason })}>{t("peerReviews.decline")}</button>
              </div>
            </div>
          )}
        </>
      )}
      {message ? <p className="challenge-note">{message}</p> : null}
      {error ? <p className="challenge-error">{error}</p> : null}
    </section>
  );
}

function formatRewardSummary(challenge: Challenge, locale: AppLocale): string {
  const rewards: string[] = [];
  if (challenge.core_reward_amount > 0) rewards.push(`Core +${formatRoundedMoney(challenge.core_reward_amount, locale)}`);
  if (challenge.wallet_reward_amount > 0) rewards.push(`Wallet +${formatRoundedMoney(challenge.wallet_reward_amount, locale)}`);
  return rewards.length > 0 ? rewards.join(" · ") : `Core +${formatRoundedMoney(0, locale)}`;
}
