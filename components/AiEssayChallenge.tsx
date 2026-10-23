"use client";

import { useEffect, useState } from "react";
import FeedPostInteractions from "@/components/FeedPostInteractions";
import { useUserContext } from "@/components/UserProvider";
import { AI_ESSAY_MAX_CHARS, AI_ESSAY_MIN_CHARS, ESSAY_RUBRIC, essayReward } from "@/lib/aiEssay";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { pick, type Localized } from "@/lib/locales";
import type { FeedPost } from "@/lib/socialFeed";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type Submission = {
  body: string;
  publish_consent: boolean;
  feed_comment_id: string | null;
  status: "submitted" | "needs_work" | "scored";
  score: number | null;
  scores: Record<string, number>;
  feedback: string | null;
  core_reward_amount: number;
  wallet_reward_amount: number;
};

const COPY: Localized<Record<string, string>> = {
  en: {
    eyebrow: "Checked by AI",
    title: "Your answer",
    placeholder: "Answer the questions above in your own words…",
    publish: "Publish my answer in the discussion (members vote for strong answers)",
    submit: "Send for AI review",
    resubmit: "Send the improved answer",
    sending: "Sending…",
    chars: "{n} of {min}–{max} characters",
    reward: "At 100%: Core +{core}, Wallet +{wallet}. Up to 80% goes to Core, points above 80 to Wallet.",
    pending: "Your answer is waiting for AI review, usually within a day. You will get a notification with the score.",
    needsWork: "AI returned the answer for rework ({score}%). Improve it using the tips below and send it again.",
    scored: "Score {score}%: Core +{core}{wallet}.",
    feedback: "AI feedback",
    discussion: "Discussion: answers ranked by votes",
    hideDiscussion: "Hide the discussion",
    privacy: "AI reads the answer only to score it. The score does not depend on which position you take."
  },
  ru: {
    eyebrow: "Проверяет ИИ",
    title: "Ваш ответ",
    placeholder: "Ответьте своими словами на вопросы выше…",
    publish: "Опубликовать ответ в обсуждении (участники голосуют за сильные ответы)",
    submit: "Отправить на проверку ИИ",
    resubmit: "Отправить исправленный ответ",
    sending: "Отправляем…",
    chars: "{n} из {min}–{max} знаков",
    reward: "При 100%: Core +{core}, Wallet +{wallet}. До 80% — в Core, баллы выше 80 — в Wallet.",
    pending: "Ответ ждёт проверки ИИ, обычно в течение суток. Придёт уведомление с оценкой.",
    needsWork: "ИИ вернул ответ на доработку ({score}%). Улучшите его по подсказкам ниже и отправьте снова.",
    scored: "Оценка {score}%: Core +{core}{wallet}.",
    feedback: "Отзыв ИИ",
    discussion: "Обсуждение: ответы по голосам",
    hideDiscussion: "Скрыть обсуждение",
    privacy: "ИИ читает ответ только для оценки. Оценка не зависит от того, какую позицию вы выбрали."
  }
};

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

export default function AiEssayChallenge({
  locale,
  reward,
  t,
  onRefresh
}: {
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  reward: { coreAmount: number; walletAmount: number };
  onRefresh: () => Promise<void>;
}) {
  const copy = pick(locale, COPY);
  const { user } = useUserContext();
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [discussionPostId, setDiscussionPostId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [publish, setPublish] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchWithSupabaseAuth("/api/challenges/essay", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { submission?: Submission | null; discussionPostId?: string }) => {
        if (!active) return;
        setSubmission(payload.submission ?? null);
        setDiscussionPostId(payload.discussionPostId ?? null);
        if (payload.submission) {
          setBody(payload.submission.body);
          setPublish(payload.submission.publish_consent);
        }
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/essay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, publish })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Error");
      setSubmission((current) => ({ ...(current ?? { scores: {}, score: null, feedback: null, core_reward_amount: 0, wallet_reward_amount: 0, feed_comment_id: null }), body, publish_consent: publish, status: "submitted" }));
      await onRefresh();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Error");
    } finally {
      setSending(false);
    }
  }

  if (loading) return null;
  const base = reward.coreAmount + reward.walletAmount;
  const full = essayReward(base, 100);
  const length = body.trim().length;
  const editable = !submission || submission.status === "needs_work";
  const tooShortOrLong = length < AI_ESSAY_MIN_CHARS || length > AI_ESSAY_MAX_CHARS;

  return (
    <section className="attention-challenge">
      <div className="attention-challenge-heading">
        <span>{copy.eyebrow}</span>
        <strong>{copy.title}</strong>
      </div>

      {submission?.status === "submitted" ? <p className="challenge-note">{copy.pending}</p> : null}
      {submission?.status === "needs_work" ? <p className="challenge-error">{fill(copy.needsWork, { score: submission.score ?? 0 })}</p> : null}
      {submission?.status === "scored" ? (
        <p className="challenge-note"><strong>{fill(copy.scored, {
          score: submission.score ?? 0,
          core: submission.core_reward_amount,
          wallet: Number(submission.wallet_reward_amount) > 0 ? `, Wallet +${submission.wallet_reward_amount}` : ""
        })}</strong></p>
      ) : null}

      {submission?.feedback && submission.status !== "submitted" ? (
        <div className="challenge-field">
          <span>{copy.feedback}</span>
          <ul>
            {ESSAY_RUBRIC.map((item) => (
              <li key={item.key}>{locale === "ru" ? item.ru : item.en}: {submission.scores?.[item.key] ?? 0}%</li>
            ))}
          </ul>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{submission.feedback}</p>
        </div>
      ) : null}

      <label className="challenge-field">
        <textarea
          rows={10}
          value={body}
          disabled={!editable || sending}
          maxLength={AI_ESSAY_MAX_CHARS}
          placeholder={copy.placeholder}
          onChange={(event) => setBody(event.target.value)}
        />
        <small>{fill(copy.chars, { n: length, min: AI_ESSAY_MIN_CHARS, max: AI_ESSAY_MAX_CHARS })}</small>
      </label>

      {editable ? (
        <label className="challenge-note">
          <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} /> {copy.publish}
        </label>
      ) : null}

      <p className="challenge-note">{fill(copy.reward, { core: full.core, wallet: full.wallet })}</p>
      <p className="challenge-note">{copy.privacy}</p>
      {error ? <p className="challenge-error">{error}</p> : null}

      {editable ? (
        <button className="challenge-primary-action" type="button" disabled={sending || tooShortOrLong} onClick={() => void send()}>
          {sending ? copy.sending : submission ? copy.resubmit : copy.submit}
        </button>
      ) : null}

      {discussionPostId ? (
        <button className="challenge-secondary-action" type="button" onClick={() => setDiscussionOpen((open) => !open)}>
          {discussionOpen ? copy.hideDiscussion : copy.discussion}
        </button>
      ) : null}
      {discussionPostId && discussionOpen ? (
        <FeedPostInteractions currentUserId={user?.id ?? null} locale={locale} post={discussionPost(discussionPostId)} t={t} />
      ) : null}
    </section>
  );
}

/** The discussion thread is a public system post; the interactions block only needs its id and visibility. */
function discussionPost(id: string): FeedPost {
  const now = new Date().toISOString();
  return {
    id, author_user_id: null, author_label: "Open Abundance", authorName: "Open Abundance", source_key: "challenge:ai_future", snapshot_id: null,
    post_type: "manual", status: "published", visibility: "public", body: null, created_at: now, updated_at: now, published_at: now, deleted_at: null,
    author: null, statBlocks: [], externalLinks: [], media: [], wish: null, projectReview: null, systemStory: null
  };
}
