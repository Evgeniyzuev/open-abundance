"use client";

import { Heart, MessageCircle, Repeat2, Send, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import type { FeedPost } from "@/lib/socialFeed";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

type InteractionComment = {
  id: string;
  body: string;
  created_at: string;
  author: {
    display_name: string | null;
    username: string | null;
  } | null;
};

type InteractionPayload = {
  likeCount: number;
  liked: boolean;
  comments: InteractionComment[];
};

export default function FeedPostInteractions({
  currentUserId,
  locale,
  post,
  t,
  onReposted
}: {
  currentUserId: string | null;
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onReposted?: () => void;
}) {
  const [payload, setPayload] = useState<InteractionPayload | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [mirrorUrl, setMirrorUrl] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canInteract = Boolean(currentUserId) && post.status === "published" && post.visibility === "public";

  useEffect(() => {
    let active = true;
    if (!canInteract) {
      setPayload(null);
      return () => { active = false; };
    }

    void loadInteractions(post.id).then((nextPayload) => {
      if (active) setPayload(nextPayload);
    }).catch(() => {
      if (active) setError(t("social.feed.interactionError"));
    });
    return () => { active = false; };
  }, [canInteract, post.id, t]);

  async function runAction(action: "like" | "unlike" | "comment" | "repost", body?: string) {
    if (!canInteract || saving) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/feed/posts/${post.id}/interactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(action === "comment" ? { "Idempotency-Key": crypto.randomUUID() } : {})
        },
        body: JSON.stringify({ action, body })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? t("social.feed.interactionError"));
      setPayload(result);
      if (action === "comment") setCommentBody("");
      if (action === "repost") onReposted?.();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("social.feed.interactionError"));
    } finally {
      setSaving(false);
    }
  }

  async function sharePost() {
    const url = `${window.location.origin}/u/${post.author_user_id ?? "open-abundance"}/blog?post=${post.id}`;
    const shareText = post.body?.trim() || t("social.post.detail");
    try {
      if (navigator.share) {
        await navigator.share({ title: shareText.slice(0, 80), text: shareText, url });
      } else {
        await navigator.clipboard.writeText(`${shareText}\n${url}`);
      }
      setShareOpen(true);
    } catch {
      // A cancelled native share is not an application error.
    }
  }

  async function saveMirror() {
    if (!mirrorUrl.trim() || !currentUserId) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/feed/posts/${post.id}/external-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url: mirrorUrl.trim() })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? t("social.feed.interactionError"));
      setMirrorUrl("");
      setShareOpen(false);
    } catch (mirrorError) {
      setError(mirrorError instanceof Error ? mirrorError.message : t("social.feed.interactionError"));
    } finally {
      setSaving(false);
    }
  }

  if (!canInteract) return null;

  return (
    <section className="feed-post-interactions" aria-label={t("social.feed.sharePackage")}>
      <div className="feed-interaction-actions">
        <button className={payload?.liked ? "active" : ""} type="button" disabled={saving || !payload} onClick={() => { void runAction(payload?.liked ? "unlike" : "like"); }}>
          <Heart size={16} fill={payload?.liked ? "currentColor" : "none"} />
          <span>{payload?.likeCount ?? 0}</span>
          <span className="sr-only">{payload?.liked ? t("social.feed.unlike") : t("social.feed.like")}</span>
        </button>
        <button type="button" disabled={saving} onClick={() => document.getElementById(`comment-${post.id}`)?.focus()}>
          <MessageCircle size={16} />
          <span>{payload?.comments.length ?? 0}</span>
          <span className="sr-only">{t("social.feed.comment")}</span>
        </button>
        <button type="button" disabled={saving} onClick={() => { void runAction("repost"); }}>
          <Repeat2 size={16} />
          <span>{t("social.feed.repost")}</span>
        </button>
        <button type="button" disabled={saving} onClick={() => { void sharePost(); }}>
          <Share2 size={16} />
          <span>{t("social.feed.share")}</span>
        </button>
      </div>
      <form className="feed-comment-form" onSubmit={(event) => { event.preventDefault(); void runAction("comment", commentBody); }}>
        <input
          id={`comment-${post.id}`}
          maxLength={2000}
          placeholder={t("social.feed.commentPlaceholder")}
          value={commentBody}
          onChange={(event) => setCommentBody(event.target.value)}
        />
        <button type="submit" disabled={saving || !commentBody.trim()} aria-label={t("social.feed.commentSubmit")}>
          <Send size={15} />
        </button>
      </form>
      {payload?.comments.length ? (
        <div className="feed-comment-list">
          {payload.comments.map((comment) => (
            <article key={comment.id}>
              <strong>{comment.author?.display_name ?? comment.author?.username ?? t("social.feed.comment")}</strong>
              <p>{comment.body}</p>
              <time dateTime={comment.created_at}>{formatCommentDate(comment.created_at, locale)}</time>
            </article>
          ))}
        </div>
      ) : null}
      {shareOpen ? (
        <div className="feed-share-package">
          <strong>{t("social.feed.sharePackage")}</strong>
          <label>
            <span>{t("social.feed.mirrorUrl")}</span>
            <input inputMode="url" placeholder="https://" value={mirrorUrl} onChange={(event) => setMirrorUrl(event.target.value)} />
          </label>
          <button className="secondary-button" type="button" disabled={saving || !mirrorUrl.trim()} onClick={() => { void saveMirror(); }}>
            <Share2 size={15} />
            {t("social.feed.saveMirror")}
          </button>
          <small>{t("social.feed.shareCopied")}</small>
        </div>
      ) : null}
      {error ? <small className="finance-error">{error}</small> : null}
    </section>
  );
}

async function getAccessToken(): Promise<string> {
  const { data } = await getBrowserSupabaseClient().auth.getSession();
  return data.session?.access_token ?? "";
}

async function loadInteractions(postId: string): Promise<InteractionPayload> {
  const token = await getAccessToken();
  const response = await fetch(`/api/social/feed/posts/${postId}/interactions?ts=${Date.now()}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "Failed to load interactions.");
  return result as InteractionPayload;
}

function formatCommentDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
