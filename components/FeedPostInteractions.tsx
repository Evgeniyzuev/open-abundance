"use client";

import { ChevronDown, ChevronUp, CornerDownRight, Heart, MessageCircle, Repeat2, Send, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import MentionText from "@/components/MentionText";
import { trackClientEvent } from "@/lib/clientAnalytics";
import { COMMENT_MAX_CHARS, discussionPath } from "@/lib/feedComments";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import type { FeedPost } from "@/lib/socialFeed";
import { storyQuestion } from "@/lib/storyComments";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

type InteractionComment = {
  id: string;
  parent_comment_id?: string | null;
  body: string;
  created_at: string;
  score?: number;
  viewerVote?: number;
  own?: boolean;
  author: {
    display_name: string | null;
    username: string | null;
  } | null;
};

type InteractionPayload = {
  likeCount: number;
  liked: boolean;
  commentCount?: number;
  /** Top-level comments best first, each with its replies (one level). */
  comments: Array<InteractionComment & { replies?: InteractionComment[] }>;
};

export default function FeedPostInteractions({
  currentUserId,
  locale,
  post,
  t,
  onReposted,
  full = false
}: {
  currentUserId: string | null;
  locale: AppLocale;
  post: FeedPost;
  /** On the discussion page itself: no link to it, and a #c-<id> anchor scrolls to that comment. */
  full?: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onReposted?: () => void;
}) {
  const [payload, setPayload] = useState<InteractionPayload | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const scrolledRef = useRef(false);
  const [mirrorUrl, setMirrorUrl] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canInteract = Boolean(currentUserId) && post.status === "published" && post.visibility === "public";
  // Nova (marked as AI) asks one question under stories by others, so a reader knows what to tell.
  const showNovaQuestion = canInteract && post.author_user_id !== currentUserId && STORY_POST_TYPES.has(post.post_type) && !post.source_key?.startsWith("challenge:");

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

  // A notification link (/d/<post>#c-<comment>) lands on that comment once the list is there.
  useEffect(() => {
    if (!full || !payload || scrolledRef.current) return;
    scrolledRef.current = true;
    const target = window.location.hash.startsWith("#c-") ? document.getElementById(window.location.hash.slice(1)) : null;
    target?.scrollIntoView({ block: "center" });
  }, [full, payload]);

  async function runAction(action: "like" | "unlike" | "comment" | "repost" | "vote_comment", body?: string, vote?: { commentId: string; value: number }) {
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
        body: JSON.stringify({ action, body, ...(vote ?? {}), ...(action === "comment" && replyTo ? { parentId: replyTo.id } : {}) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? t("social.feed.interactionError"));
      setPayload(result);
      if (action === "comment") { setCommentBody(""); setReplyTo(null); }
      if (action === "repost") onReposted?.();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("social.feed.interactionError"));
    } finally {
      setSaving(false);
    }
  }

  async function sharePost() {
    const url = post.post_type === "external_link"
      ? `${window.location.origin}/p/${post.id}`
      : post.author_user_id
        ? `${window.location.origin}/u/${post.author_user_id}/blog?post=${post.id}`
        : `${window.location.origin}${discussionPath(post.id)}`;
    const shareText = post.body?.trim() || t("social.post.detail");
    const method = typeof navigator.share === "function" ? "native" : "copy";
    try {
      if (method === "native") {
        await navigator.share({ title: shareText.slice(0, 80), text: shareText, url });
      } else {
        await navigator.clipboard.writeText(`${shareText}\n${url}`);
      }
      setShareOpen(true);
      // Share intent only: the app cannot see whether a post appears in an outside network.
      void trackClientEvent("feed_post_shared_external", { post_id: post.id, method });
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

  function startReply(comment: InteractionComment, rootId: string) {
    const name = comment.author?.username ? `@${comment.author.username}` : comment.author?.display_name ?? t("social.feed.comment");
    setReplyTo({ id: rootId, name });
    // Naming the person keeps a reply-to-a-reply readable inside the one-level branch.
    if (comment.author?.username && comment.id !== rootId) setCommentBody((current) => current.trim() ? current : `@${comment.author!.username} `);
    document.getElementById(`comment-${post.id}`)?.focus();
  }

  function renderComment(comment: InteractionComment, rootId: string = comment.id) {
    return (
      <article id={`c-${comment.id}`}>
        <strong>{comment.author?.display_name ?? (comment.author?.username ? `@${comment.author.username}` : t("social.feed.comment"))}{comment.author?.display_name && comment.author?.username ? <small className="profile-handle"> @{comment.author.username}</small> : null}</strong>
        <p><MentionText text={comment.body} /></p>
        <time dateTime={comment.created_at}>{formatCommentDate(comment.created_at, locale)}</time>
        <div className="feed-comment-votes">
          {typeof comment.score === "number" ? (
            <>
              <button type="button" disabled={saving || comment.own} aria-pressed={comment.viewerVote === 1} aria-label="+1" onClick={() => void runAction("vote_comment", undefined, { commentId: comment.id, value: comment.viewerVote === 1 ? 0 : 1 })}>
                <ChevronUp size={16} aria-hidden />
              </button>
              <span>{comment.score}</span>
              <button type="button" disabled={saving || comment.own} aria-pressed={comment.viewerVote === -1} aria-label="-1" onClick={() => void runAction("vote_comment", undefined, { commentId: comment.id, value: comment.viewerVote === -1 ? 0 : -1 })}>
                <ChevronDown size={16} aria-hidden />
              </button>
            </>
          ) : null}
          <button className="feed-comment-reply" type="button" disabled={saving} onClick={() => startReply(comment, rootId)}>
            <CornerDownRight size={14} aria-hidden />
            <span>{t("social.feed.reply")}</span>
          </button>
        </div>
      </article>
    );
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
          <span>{payload?.commentCount ?? payload?.comments.length ?? 0}</span>
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
      {replyTo ? (
        <div className="feed-comment-replying">
          <CornerDownRight size={14} aria-hidden />
          <span>{t("social.feed.replyingTo", { name: replyTo.name })}</span>
          <button type="button" aria-label={t("social.feed.cancelReply")} onClick={() => setReplyTo(null)}><X size={14} aria-hidden /></button>
        </div>
      ) : null}
      {showNovaQuestion && !replyTo ? (
        <div className="feed-nova-question">
          <img alt="" src="/nova-fox-robot.webp" />
          <div>
            <span className="feed-nova-question-name">{t("social.feed.novaQuestion.name")}</span>
            <p>{storyQuestion(post.source_key, locale)}</p>
            <button type="button" onClick={() => document.getElementById(`comment-${post.id}`)?.focus()}>{t("social.feed.novaQuestion.answer")}</button>
            <small>{t("social.feed.novaQuestion.reward")}</small>
          </div>
        </div>
      ) : null}
      <form className="feed-comment-form" onSubmit={(event) => { event.preventDefault(); void runAction("comment", commentBody); }}>
        <input
          id={`comment-${post.id}`}
          maxLength={COMMENT_MAX_CHARS}
          placeholder={replyTo ? t("social.feed.replyPlaceholder") : t("social.feed.commentPlaceholder")}
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
            <div className="feed-comment-thread" key={comment.id}>
              {renderComment(comment)}
              {comment.replies?.length ? (
                <div className="feed-comment-replies">
                  {comment.replies.map((reply) => <div key={reply.id}>{renderComment(reply, comment.id)}</div>)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {!full && (payload?.commentCount ?? 0) > 0 ? (
        <a className="feed-comment-open-discussion" href={discussionPath(post.id)}>{t("social.feed.openDiscussion")}</a>
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

/** Posts where Nova's question makes sense: stories and links, not automatic progress posts. */
const STORY_POST_TYPES = new Set(["manual", "abundance_story", "external_link", "wish", "wish_completed", "reality_demo"]);
