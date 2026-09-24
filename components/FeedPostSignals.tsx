"use client";

import { EyeOff, Handshake, Heart, MoreHorizontal, Sparkles } from "lucide-react";
import { useState, type MouseEvent } from "react";
import type { MessageKey } from "@/lib/i18n";
import { trackClientEvent } from "@/lib/clientAnalytics";
import { recordFeedSignal } from "@/lib/feedPreferences";
import type { FeedPost } from "@/lib/socialFeed";
import { recommendedWishIdForStory } from "@/lib/wishJourney";

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

type SharedProps = {
  currentUserId: string | null | undefined;
  post: FeedPost;
  t: Translate;
};

type WishProps = {
  onAddStoryWish?: (post: FeedPost) => void;
  storyWishError?: string | null;
  storyWishSaving?: boolean;
};

const INTEREST_OPTIONS = [
  ["result", "social.feed.interestQuestion.result"],
  ["lifestyle", "social.feed.interestQuestion.lifestyle"],
  ["process", "social.feed.interestQuestion.process"],
  ["people", "social.feed.interestQuestion.people"],
  ["unknown", "social.feed.interestQuestion.unknown"]
] as const;

export function FeedPostSignalMenu({
  currentUserId,
  onAddStoryWish,
  onSignalChanged,
  post,
  storyWishSaving = false,
  t
}: SharedProps & WishProps & { onSignalChanged?: () => void }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const canWish = Boolean(onAddStoryWish && recommendedWishIdForStory(post.source_key));
  const canHelp = canOfferHelp(post);

  if (!canUseSignals(currentUserId, post)) return null;

  function closeMenu(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  function signal(signal: "interest" | "not_for_me" | "can_help", event: MouseEvent<HTMLButtonElement>) {
    if (!currentUserId) return;
    recordFeedSignal(currentUserId, post, signal);
    void trackSignal(post, signal);
    onSignalChanged?.();
    if (signal === "not_for_me") {
      return;
    }
    setFeedback(signal === "interest" ? t("social.feed.interestSaved") : t("social.feed.helpSaved"));
  }

  function addWish(event: MouseEvent<HTMLButtonElement>) {
    if (!onAddStoryWish || storyWishSaving) return;
    if (currentUserId) recordFeedSignal(currentUserId, post, "interest");
    void trackSignal(post, "want_this");
    onSignalChanged?.();
    closeMenu(event);
    onAddStoryWish(post);
  }

  return (
    <details className="feed-post-signal-menu">
      <summary aria-label={t("social.feed.signalMenu")} title={t("social.feed.signalMenu")}>
        <MoreHorizontal aria-hidden="true" size={17} />
        <span className="sr-only">{t("social.feed.signalMenu")}</span>
      </summary>
      <div className="feed-post-signal-menu-items" role="menu">
        {canWish ? (
          <button aria-busy={storyWishSaving} disabled={storyWishSaving} type="button" onClick={addWish}>
            <Heart aria-hidden="true" size={14} />
            {storyWishSaving ? t("app.common.loading") : t("social.feed.wantThis")}
          </button>
        ) : null}
        <button type="button" onClick={(event) => signal("interest", event)}>
          <Sparkles aria-hidden="true" size={14} />
          {t("social.feed.interest")}
        </button>
        <button type="button" onClick={(event) => signal("not_for_me", event)}>
          <EyeOff aria-hidden="true" size={14} />
          {t("social.feed.notForMe")}
        </button>
        {canHelp ? (
          <button type="button" onClick={(event) => signal("can_help", event)}>
            <Handshake aria-hidden="true" size={14} />
            {t("social.feed.canHelp")}
          </button>
        ) : null}
        {feedback ? <small className="feed-post-signal-feedback" role="status">{feedback}</small> : null}
      </div>
    </details>
  );
}

export function FeedPostSignalButtons({
  currentUserId,
  onAddStoryWish,
  post,
  storyWishError,
  storyWishSaving = false,
  t
}: SharedProps & WishProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [questionOpen, setQuestionOpen] = useState(false);
  const canWish = Boolean(onAddStoryWish && recommendedWishIdForStory(post.source_key));
  const canHelp = canOfferHelp(post);

  if (!canUseSignals(currentUserId, post)) return null;

  function signal(signalType: "interest" | "not_for_me" | "can_help") {
    if (!currentUserId) return;
    recordFeedSignal(currentUserId, post, signalType);
    void trackSignal(post, signalType);
    if (signalType === "interest") {
      setQuestionOpen(true);
      setFeedback(t("social.feed.interestSaved"));
    } else if (signalType === "not_for_me") {
      setFeedback(t("social.feed.notForMeSaved"));
    } else {
      setFeedback(t("social.feed.helpSaved"));
    }
  }

  function addWish() {
    if (!onAddStoryWish || storyWishSaving) return;
    if (currentUserId) recordFeedSignal(currentUserId, post, "interest");
    void trackSignal(post, "want_this");
    onAddStoryWish(post);
  }

  function clarifyInterest(value: string) {
    void trackClientEvent("feed_interest_clarified", {
      post_id: post.id,
      source_key: post.source_key,
      topic: value
    });
    setFeedback(t("social.feed.interestClarified"));
    setQuestionOpen(false);
  }

  return (
    <section className="feed-post-signal-actions" aria-label={t("social.feed.signalMenu")}>
      <div className="feed-post-signal-button-row">
        {canWish ? (
          <button className="primary-button" type="button" disabled={storyWishSaving} onClick={addWish}>
            <Heart aria-hidden="true" size={16} />
            {storyWishSaving ? t("app.common.loading") : t("social.feed.wantThis")}
          </button>
        ) : null}
        <button className="secondary-button" type="button" onClick={() => signal("interest")}>
          <Sparkles aria-hidden="true" size={16} />
          {t("social.feed.interest")}
        </button>
        <button className="secondary-button" type="button" onClick={() => signal("not_for_me")}>
          <EyeOff aria-hidden="true" size={16} />
          {t("social.feed.notForMe")}
        </button>
        {canHelp ? (
          <button className="secondary-button" type="button" onClick={() => signal("can_help")}>
            <Handshake aria-hidden="true" size={16} />
            {t("social.feed.canHelp")}
          </button>
        ) : null}
      </div>
      {storyWishError ? <p className="finance-error inline" role="alert">{storyWishError}</p> : null}
      {feedback ? <small className="feed-post-signal-feedback" role="status">{feedback}</small> : null}
      {questionOpen ? (
        <fieldset className="feed-post-interest-question">
          <legend>{t("social.feed.interestQuestion")}</legend>
          <div>
            {INTEREST_OPTIONS.map(([value, key]) => (
              <button key={value} type="button" onClick={() => clarifyInterest(value)}>{t(key as MessageKey)}</button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </section>
  );
}

function canUseSignals(userId: string | null | undefined, post: FeedPost): boolean {
  return Boolean(userId) && post.status === "published" && post.visibility === "public";
}

function canOfferHelp(post: FeedPost): boolean {
  return post.post_type === "challenge" || Boolean(post.verifiedChallenge);
}

async function trackSignal(post: FeedPost, signal: string): Promise<void> {
  await trackClientEvent(`feed_${signal}`, {
    post_id: post.id,
    post_type: post.post_type,
    source_key: post.source_key
  });
}
