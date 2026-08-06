"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { ACQUISITION_PLATFORM_RULES } from "@/lib/acquisitionChallenges";

type Challenge = {
  id: string;
  verification_logic: string | null;
  acquisition_target?: number | null;
  acquisition_metric_key?: string | null;
  user_challenge_status?: string | null;
};

type Submission = {
  id: string;
  challenge_id: string;
  submission_type: "publication" | "metric";
  canonical_url: string;
  platform: string;
  title?: string | null;
  cover_url?: string | null;
  metric_key?: string | null;
  metric_value?: number | null;
  status: "pending_review" | "approved" | "rejected" | "cancelled";
  review_round?: number;
  created_at: string;
};


export default function AcquisitionChallengePanel({
  challenge,
  locale,
  onRefresh,
  onComplete,
  readOnly = false
}: {
  challenge: Challenge;
  locale: "ru" | "en";
  onRefresh: () => Promise<void>;
  onComplete: (reward: { amount: number; account: string; claimed: boolean }) => void;
  readOnly?: boolean;
}) {
  const ru = locale === "ru";
  const isMetric = challenge.verification_logic?.startsWith("acquisition_metric_") === true;
  const metricLabel = challenge.acquisition_metric_key ?? challenge.verification_logic?.replace("acquisition_metric_", "") ?? "metric";
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [trackedUrl, setTrackedUrl] = useState("");
  const [referralUrl, setReferralUrl] = useState("");
  const [platform, setPlatform] = useState("blog");
  const [url, setUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [publicationId, setPublicationId] = useState("");
  const [metricValue, setMetricValue] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const text = {
    link: ru ? "Трек-ссылка для публикации" : "Tracked link for the publication",
    copy: ru ? "Скопировать" : "Copy",
    platform: ru ? "Площадка" : "Platform",
    publicationUrl: ru ? "URL публикации" : "Publication URL",
    cover: ru ? "URL картинки/обложки или превью" : "Cover/image/preview URL",
    title: ru ? "Заголовок" : "Title",
    context: ru ? "Личный контекст" : "Personal context",
    referral: ru ? "URL трек-ссылки, вставленной в материал" : "Tracked URL used in the material",
    submit: ru ? "Отправить на 3 проверки" : "Send for 3 reviews",
    metric: (ru ? "Значение: " : "Value: ") + metricLabel + (ru ? " (цель " : " (target ") + String(challenge.acquisition_target ?? 0) + ")",
    evidence: ru ? "Публичное доказательство метрики" : "Public metric evidence",
    submitMetric: ru ? "Отправить метрику на проверку" : "Send metric for review",
    instructions: ru ? "Нужна публичная страница, визуальная обложка и честный кликбейт. Спам, копипаст, закрытые чаты, платная реклама и накрутка не принимаются. Один принятый материал — не чаще раза в 24 часа." : "Use a public page, a visual cover and an honest clickbait title. Spam, copied text, closed chats, paid ads and bought engagement are rejected. At most one accepted publication per 24 hours.",
    status: ru ? "Статус" : "Status",
    refresh: ru ? "Обновить статус" : "Refresh status",
    noPublication: ru ? "Сначала нужна одобренная публикация." : "An approved publication is required first"
  };

  const approvedPublications = useMemo(() => submissions.filter((submission) => submission.submission_type === "publication" && submission.status === "approved"), [submissions]);

  async function load() {
    const token = await getToken();
    if (!token) return;
    const response = await fetch("/api/challenges/acquisition", { cache: "no-store", headers: { Authorization: "Bearer " + token } });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not load acquisition status.");
setSubmissions(payload.submissions ?? []);
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load status."));
  }, [challenge.id]);

  async function prepareLink() {
    setBusy(true);
    setMessage("");
    try {
      const token = await getToken();
      const response = await fetch("/api/challenges/acquisition", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ action: "prepare", challengeId: challenge.id })
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not prepare link.");
      setTrackedUrl(payload.trackedUrl ?? "");
      setReferralUrl(payload.trackedUrl ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare link.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const token = await getToken();
      const body = isMetric
        ? { action: "submit", challengeId: challenge.id, submissionType: "metric", canonicalUrl: evidenceUrl, platform, publicationSubmissionId: publicationId, metricValue: Number(metricValue), metricEvidenceUrl: evidenceUrl }
        : { action: "submit", challengeId: challenge.id, submissionType: "publication", canonicalUrl: url, platform, title, coverUrl, referralUrl, bodyExcerpt: context };
      const response = await fetch("/api/challenges/acquisition", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not submit evidence.");
      setMessage(ru ? "Отправлено. Материал передан на проверку." : "Submitted. It will be reviewed by three participants.");
      await load();
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit evidence.");
    } finally {
      setBusy(false);
    }
  }
  async function refreshAndCheck() {
    setBusy(true);
    setMessage("");
    try {
      await load();
      await onRefresh();
      if (readOnly) return;
      const token = await getToken();
      const response = await fetch("/api/challenges/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ challengeId: challenge.id })
      });
      const payload = await response.json();
      if (payload.completed) onComplete({ amount: Number(payload.rewardAmount ?? 0), account: payload.rewardAccount ?? "core", claimed: Boolean(payload.rewardClaimed) });
      else if (payload.message) setMessage(payload.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="challenge-acquisition-panel">
      <div className="challenge-detail-grid">
        <span>{isMetric ? text.metric : (ru ? "Цель: " : "Target: ") + String(challenge.acquisition_target ?? 1)}</span>
      </div>
      <p className="challenge-note">{text.instructions}</p>

      {!readOnly ? (
        !isMetric ? (
        <>
          <button className="challenge-secondary-action" type="button" disabled={busy} onClick={() => void prepareLink()}>{busy ? "…" : (trackedUrl ? text.copy : (ru ? "Получить трек-ссылку" : "Get tracked link"))}</button>
          {trackedUrl ? (
            <div className="challenge-acquisition-link">
              <input value={trackedUrl} readOnly aria-label={text.link} onFocus={(event) => event.currentTarget.select()} />
              <button type="button" onClick={() => void navigator.clipboard?.writeText(trackedUrl)}>{text.copy}</button>
            </div>
          ) : null}
          <label>{text.platform}<select value={platform} onChange={(event) => setPlatform(event.target.value)}>{ACQUISITION_PLATFORM_RULES.map((rule) => <option key={rule.key} value={rule.key}>{rule.label}</option>)}</select></label>
          <label>{text.publicationUrl}<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." /></label>
          <label>{text.cover}<input value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} placeholder="https://..." /></label>
          <label>{text.title}<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>{text.context}<textarea value={context} onChange={(event) => setContext(event.target.value)} /></label>
          <label>{text.referral}<input value={referralUrl} onChange={(event) => setReferralUrl(event.target.value)} placeholder={trackedUrl || "https://app.example/?ref=..."} /></label>
          <button className="challenge-primary-action" type="button" disabled={busy} onClick={() => void submit()}>{busy ? "…" : text.submit}</button>
        </>
      ) : (
        <>
          {approvedPublications.length === 0 ? <p className="challenge-note">{text.noPublication}</p> : <label>{ru ? "Одобренная публикация" : "Approved publication"}<select value={publicationId} onChange={(event) => setPublicationId(event.target.value)}><option value="">—</option>{approvedPublications.map((publication) => <option key={publication.id} value={publication.id}>{publication.title || publication.canonical_url}</option>)}</select></label>}
          <label>{text.metric}<input type="number" min={challenge.acquisition_target ?? 0} value={metricValue} onChange={(event) => setMetricValue(event.target.value)} /></label>
          <label>{text.evidence}<input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://..." /></label>
          <button className="challenge-primary-action" type="button" disabled={busy || approvedPublications.length === 0} onClick={() => void submit()}>{busy ? "…" : text.submitMetric}</button>
        </>
        )
      ) : null}

      {submissions.filter((submission) => submission.challenge_id === challenge.id).map((submission) => (
        <p className="challenge-note" key={submission.id}>{text.status}: {submission.status} · {submission.canonical_url}</p>
      ))}

      <button className="challenge-secondary-action" type="button" disabled={busy} onClick={() => void refreshAndCheck()}>{text.refresh}</button>
      {message ? <p className="challenge-note">{message}</p> : null}
    </section>
  );
}

async function getToken(): Promise<string> {
  const supabase = getBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}