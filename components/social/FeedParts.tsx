"use client";

import type { TeamProfile, TrustConfirmationRow, ReviewEditPayload } from "@/components/social/socialTypes";
import { getAccessToken, formatDate, formatProfileName, localizedMediaAlt, localizedSystemBio, trustConfirmationTypeLabelKey, trustConfirmationStatusLabelKey, postStatusLabelKey, verificationLabelKey, formatPostDate, formatWishAmount, formatProviderLabel, statBlockClassName } from "@/components/social/socialHelpers";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Edit3, ExternalLink, GalleryVertical, LayoutGrid, Send, Star, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import FeedPostGallery, { getFeedPostCover } from "@/components/FeedPostGallery";
import FeedPostInteractions from "@/components/FeedPostInteractions";
import { canUseFeedSignals, FeedPostSignalButtons, recordFeedSwipeSignal } from "@/components/FeedPostSignals";
import { classifySwipe } from "@/lib/swipe";
import { useEdgeSwipeBack, useHistoryLayer } from "@/lib/historyLayer";
import { hasBeenSeen, markSeen } from "@/lib/seenOnce";
import { celebrate } from "@/lib/ui/feedback";
import FeedStoryRings from "@/components/social/FeedStoryRings";
import ChipRow from "@/components/ui/ChipRow";
import Skeleton from "@/components/ui/Skeleton";
import { type FeedFilter } from "@/components/social/useFeed";
import FollowButton from "@/components/FollowButton";
import MediaUrlHelp from "@/components/MediaUrlHelp";
import { ShortLinkVideoEmbed, VideoEmbedPlayer } from "@/components/VideoEmbed";
import { findShortVideoLinks, findVideoEmbeds, isShortVideoLink, videoEmbedFromUrl } from "@/lib/videoEmbed";
import { UserNameWithLevel } from "@/components/UserLevelBadge";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney as formatMoney } from "@/lib/moneyFormat";
import { formatStatBlockValue, statBlockLabelKey } from "@/lib/realityDayFormat";
import type { FeedMedia, FeedPayload, FeedPost, FeedReviewSummary, FeedStatBlock, FeedWish as PublicWish } from "@/lib/socialFeed";
import { APP_TESTING_ATTITUDES, APP_TESTING_USEFUL_AREAS } from "@/lib/appTestingFeedback";

const MIN_FIRST_SCREEN_POSTS = 9;
const FILL_PAGE_SIZE = 60;

export function FeedView({
  addingStoryWishKey,
  copyingWishId,
  currentUserId,
  dailyDraft,
  systemDrafts,
  externalLinkUrl,
  linkComposerOpen,
  feedPayload,
  filter,
  failed,
  hasNew,
  loading,
  loadingMore,
  saving,
  locale,
  t,
  onRefreshNew,
  onRetry,
  onCreateDraft,
  onCreateExternalLink,
  onAddStoryWish,
  onCopyWish,
  onDraftBodyChange,
  onDraftBodyChangeForPost,
  onExternalLinkUrlChange,
  onFilterChange,
  onLoadMore,
  onLinkComposerToggle,
  onOpenAuthor,
  onOpenBlog,
  onOpenChallenge,
  onOpenPost,
  onOpenSystemAccount,
  onDeletePost,
  onPublish,
  onUpdateCover,
  onUploadCover,
  onToggleDraftBlock
}: {
  addingStoryWishKey: string | null;
  copyingWishId: string | null;
  currentUserId: string;
  dailyDraft: FeedPost | null;
  systemDrafts: FeedPost[];
  externalLinkUrl: string;
  linkComposerOpen: boolean;
  feedPayload: FeedPayload | null;
  filter: FeedFilter;
  failed: boolean;
  hasNew: boolean;
  loading: boolean;
  loadingMore: boolean;
  saving: boolean;
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onRefreshNew: () => void;
  onRetry: () => void;
  onCreateDraft: () => void;
  onCreateExternalLink: () => void;
  onAddStoryWish: (post: FeedPost) => void;
  onCopyWish: (wish: PublicWish) => void;
  onDraftBodyChange: (body: string) => void;
  onDraftBodyChangeForPost: (postId: string, body: string) => void;
  onExternalLinkUrlChange: (url: string) => void;
  onFilterChange: (filter: FeedFilter) => void;
  onLoadMore: (pageSize?: number) => void;
  onLinkComposerToggle: () => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenChallenge: () => void;
  onOpenPost: (post: FeedPost) => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
  onUpdateCover: (post: FeedPost, templateKey: string) => void;
  onUploadCover: (post: FeedPost, file: File) => void;
  onToggleDraftBlock: (blockKey: string) => void;
}) {
  const posts = feedPayload?.posts ?? [];
  const hasMore = Boolean(feedPayload?.nextCursor);
  const [layout, setLayout] = useState<"grid" | "reels">("grid");
  useEffect(() => {
    try {
      if (window.localStorage.getItem("openAbundanceFeedLayout") === "reels") setLayout("reels");
    } catch {
      // Layout choice is a convenience only.
    }
  }, []);
  function chooseLayout(next: "grid" | "reels") {
    setLayout(next);
    try {
      window.localStorage.setItem("openAbundanceFeedLayout", next);
    } catch {
      // Layout choice is a convenience only.
    }
  }
  const [visibleCount, setVisibleCount] = useState(0);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  const autoLoadedAtRef = useRef(-1);
  onLoadMoreRef.current = onLoadMore;

  // Load the next page when the "load more" button scrolls near the viewport; the button stays as a fallback.
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || loadingMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      // One automatic attempt per page size, so a failing request cannot loop.
      if (!entry.isIntersecting || autoLoadedAtRef.current === posts.length) return;
      autoLoadedAtRef.current = posts.length;
      onLoadMoreRef.current();
    }, { rootMargin: "400px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, posts.length]);

  // Make sure the first screen can show three full rows. Count the tiles that are really shown (topics the person muted
  // with "Not for me" are hidden on the device), and while fewer than 9 are shown and more exist, fetch the next page
  // (a few attempts per filter, so a failing request cannot loop).
  const fillAttemptsRef = useRef({ filter, count: 0 });
  useEffect(() => {
    if (!hasMore || loading || loadingMore || posts.length === 0 || visibleCount >= MIN_FIRST_SCREEN_POSTS) return;
    if (fillAttemptsRef.current.filter !== filter) fillAttemptsRef.current = { filter, count: 0 };
    if (fillAttemptsRef.current.count >= 6) return;
    fillAttemptsRef.current.count += 1;
    // A big page: the server hides some posts per viewer and the device hides muted topics, so a normal page can add very few.
    onLoadMoreRef.current(FILL_PAGE_SIZE);
  }, [filter, hasMore, loading, loadingMore, posts.length, visibleCount]);

  return (
    <section className="feed-layout">
      <div className="feed-toolbar">
        <ChipRow<FeedFilter>
          ariaLabel={t("social.feed.title")}
          moreLabel={t("social.feed.filter.more")}
          primary={[
            { value: "all", label: t("social.feed.filter.all") },
            { value: "following", label: t("social.feed.filter.following") },
            { value: "stories", label: t("social.feed.filter.stories") }
          ]}
          more={[
            { value: "opportunities", label: t("social.feed.filter.opportunities") },
            { value: "system", label: t("social.feed.filter.system") },
            { value: "reviews", label: t("social.feed.filter.reviews") }
          ]}
          value={filter}
          onChange={onFilterChange}
        />
        <button aria-label={t(layout === "grid" ? "social.feed.layout.reels" : "social.feed.layout.grid")} className="feed-layout-toggle" type="button" onClick={() => chooseLayout(layout === "grid" ? "reels" : "grid")}>
          {layout === "grid" ? <GalleryVertical size={18} /> : <LayoutGrid size={18} />}
        </button>
      </div>
      {hasNew ? <button className="feed-new-banner" type="button" onClick={onRefreshNew}>{t("social.feed.newStories")}</button> : null}
      <FeedStoryRings currentUserId={currentUserId} label={t("social.feed.rings")} posts={posts} onOpenAuthor={onOpenAuthor} onOpenSystemAccount={onOpenSystemAccount} />
      {filter === "opportunities" ? <p className="feed-mode-hint">{t("social.feed.opportunitiesHint")}</p> : null}
      {filter === "reviews" && feedPayload?.reviewSummary ? (
        <ReviewSummary summary={feedPayload.reviewSummary} locale={locale} t={t} />
      ) : null}
      <PostList
        addingStoryWishKey={addingStoryWishKey}
        copyingWishId={copyingWishId}
        currentUserId={currentUserId}
        emptyText={t("social.feed.empty")}
        failed={failed}
        hasMore={hasMore}
        onVisibleCountChange={setVisibleCount}
        layout={layout}
        loading={loading || (!feedPayload && !failed)}
        locale={locale}
        posts={posts}
        onRetry={onRetry}
        emptyState={filter === "all" ? (
          <div className="feed-empty-action">
            <p>{t("social.feed.empty")}</p>
            <small>{t("social.feed.emptyHint")}</small>
          </div>
        ) : undefined}
        showBlogAction={true}
        t={t}
        onCopyWish={onCopyWish}
        onAddStoryWish={onAddStoryWish}
        onOpenAuthor={onOpenAuthor}
        onOpenBlog={onOpenBlog}
        onOpenPost={onOpenPost}
        onOpenSystemAccount={onOpenSystemAccount}
        onDeletePost={onDeletePost}
        onPublish={onPublish}
      />
      {feedPayload?.nextCursor ? (
        <button className="secondary-button feed-load-more" ref={loadMoreRef} type="button" disabled={loadingMore} onClick={() => onLoadMore()}>
          {loadingMore ? t("app.common.loading") : t("social.review.loadMore")}
        </button>
      ) : null}
      <button className="secondary-button feed-today-action" type="button" onClick={onOpenChallenge}>
        {t("social.feed.takeStep")} <ArrowRight size={15} />
      </button>
    </section>
  );
}

export function ReviewSummary({ summary, locale, t }: {
  summary: FeedReviewSummary;
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  return (
    <section className="review-summary">
      <div>
        <span>{t("social.review.summary")}</span>
        <strong>{summary.count ? summary.average.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : "—"}</strong>
        <ReviewStars value={Math.round(summary.average)} />
        <small>{t("social.review.count", { count: summary.count })}</small>
      </div>
      <div className="review-distribution">
        {[5, 4, 3, 2, 1].map((rating) => (
          <div key={rating}>
            <span>{rating}</span>
            <Star size={12} fill="currentColor" />
            <progress max={Math.max(summary.count, 1)} value={summary.distribution[String(rating)] ?? 0} />
            <small>{summary.distribution[String(rating)] ?? 0}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ExternalLinkComposer({
  open,
  saving,
  t,
  url,
  onToggle,
  onSubmit,
  onUrlChange
}: {
  open: boolean;
  saving: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  url: string;
  onToggle: () => void;
  onSubmit: () => void;
  onUrlChange: (url: string) => void;
}) {
  if (!open) {
    return (
      <button className="compact-composer-action" type="button" onClick={onToggle}>
        <ExternalLink size={15} />
        {t("social.feed.externalLink")}
      </button>
    );
  }

  return (
    <form className="external-link-composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <label htmlFor="external-link-url">
        {t("social.feed.externalLink")}
        <MediaUrlHelp t={t} />
        <button className="text-button" type="button" onClick={onToggle}>{t("app.common.close")}</button>
      </label>
      <div>
        <input
          id="external-link-url"
          inputMode="url"
          maxLength={1000}
          placeholder={t("social.feed.externalLinkPlaceholder")}
          type="url"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
        />
        <button className="finance-small-icon-button primary" type="submit" disabled={saving || !url.trim()} aria-label={t("social.feed.addExternalLink")}>
          <ExternalLink size={15} />
        </button>
      </div>
    </form>
  );
}

export function SystemEventCoverPicker({ post, saving, t, onUpdateCover, onUploadCover }: {
  post: FeedPost;
  saving: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onUpdateCover: (post: FeedPost, templateKey: string) => void;
  onUploadCover: (post: FeedPost, file: File) => void;
}) {
  const options = [
    ["daily_progress", "social.feed.cover.template.daily_progress", "/feed/system-events/daily-progress.png"],
    ["level_up", "social.feed.cover.template.level_up", "/feed/system-events/level-up.png"],
    ["wish_completed", "social.feed.cover.template.wish_completed", "/feed/system-events/wish-completed.png"],
    ["challenge_completed", "social.feed.cover.template.challenge_completed", "/feed/system-events/challenge-completed.png"]
  ] as const;
  const currentUrl = (post.media ?? []).find((media) => media.sort_order === 0)?.media_url;
  return (
    <div className="system-event-cover-picker">
      <div className="system-event-cover-heading">
        <span>{t("social.feed.cover")}</span>
        <label className="secondary-button system-event-upload">
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUploadCover(post, file);
            event.currentTarget.value = "";
          }} />
          {t("social.feed.cover.upload")}
        </label>
      </div>
      <div className="system-event-cover-options">
        {options.map(([key, labelKey, url]) => (
          <button className={currentUrl === url ? "active" : ""} type="button" key={key} disabled={saving} aria-label={t(labelKey)} aria-pressed={currentUrl === url} onClick={() => onUpdateCover(post, key)}>
            <img alt="" src={url} />
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PostList(props: {
  addingStoryWishKey?: string | null;
  copyingWishId: string | null;
  currentUserId: string;
  emptyText: string;
  emptyState?: ReactNode;
  failed?: boolean;
  hasMore?: boolean;
  layout?: "grid" | "reels";
  loading: boolean;
  onVisibleCountChange?: (count: number) => void;
  locale: AppLocale;
  posts: FeedPost[];
  saving?: boolean;
  showBlogAction: boolean;
  showSystemProfileAction?: boolean;
  showTileAuthor?: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onCopyWish: (wish: PublicWish) => void;
  onAddStoryWish?: (post: FeedPost) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenPost: (post: FeedPost) => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
  onRetry?: () => void;
}) {
  const { addingStoryWishKey, emptyState, emptyText, failed, hasMore, layout, loading, onAddStoryWish, onOpenPost, onRetry, posts, showTileAuthor = true, t } = props;
  if (loading && !posts.length) {
    return <div className="feed-post-gallery feed-post-gallery-loading" aria-busy="true" aria-label={t("app.common.loading")}>
      <Skeleton className="feed-post-hero-skeleton" />
      {Array.from({ length: 9 }, (_, index) => <Skeleton aspectRatio="4 / 5" className="feed-post-tile-skeleton" key={index} />)}
    </div>;
  }
  if (failed && !posts.length && onRetry) {
    return <div className="feed-empty-action">
      <p>{t("social.feed.loadFailed")}</p>
      <button className="secondary-button" type="button" onClick={onRetry}>{t("app.common.retry")}</button>
    </div>;
  }
  if (!posts.length) return emptyState ?? <p className="feed-empty">{emptyText}</p>;

  return <FeedPostGallery addingStoryWishKey={addingStoryWishKey} currentUserId={props.currentUserId} emptyText={emptyText} hasMore={hasMore} layout={layout} onVisibleCountChange={props.onVisibleCountChange} fallbackTitle={t("social.post.detail")} posts={posts} showAuthor={showTileAuthor} t={t} wishActionLabel={t("social.feed.wantThis")} evidenceLabels={{ demo: t("social.feed.demoBadge"), verified: t("social.feed.verifiedBadge") }} onAddStoryWish={onAddStoryWish} onOpen={onOpenPost} />;
}

export function PostCard({
  copyingWishId,
  currentUserId,
  locale,
  post,
  saving,
  showBlogAction,
  showSystemProfileAction,
  t,
  onCopyWish,
  onOpenAuthor,
  onOpenBlog,
  onOpenPost,
  onOpenSystemAccount,
  onDeletePost,
  onPublish
}: {
  copyingWishId: string | null;
  currentUserId: string;
  locale: AppLocale;
  post: FeedPost;
  saving: boolean;
  showBlogAction: boolean;
  showSystemProfileAction: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onCopyWish: (wish: PublicWish) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenPost: (post: FeedPost) => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
}) {
  const canDelete = Boolean(post.author_user_id) && post.author_user_id === currentUserId;

  return (
    <article className="feed-post-card">
      <header>
        <div className="feed-author-block">
          <PostAuthor post={post} t={t} onOpenAuthor={onOpenAuthor} onOpenSystemAccount={onOpenSystemAccount} />
          {post.post_type === "reality_demo" ? <span className="reality-demo-badge">{t("social.feed.demoBadge")}</span> : null}
          {post.post_type === "abundance_story" ? (
            <span className="system-story-badge">
              {showSystemProfileAction || !post.systemStory
                ? t("social.feed.systemStoryBadge")
                : t("social.systemProfile.chapterNumber", { number: post.systemStory.series_order })}
            </span>
          ) : null}
          {post.post_type === "project_review" ? <span className="project-review-badge">{t("social.review.badge")}</span> : null}
        </div>
        <small>{formatPostDate(post, locale)}</small>
      </header>
      <button className="feed-post-body" type="button" onClick={() => onOpenPost(post)}>
        {post.projectReview ? (
          <div className="project-review-rating">
            <ReviewStars value={post.projectReview.overall_rating} />
            <span>{t("social.review.mission", { rating: post.projectReview.mission_rating })}</span>
          </div>
        ) : null}
        <p>{post.body ?? t("social.post.detail")}</p>
        <StatBlockGrid blocks={post.statBlocks} locale={locale} t={t} />
      </button>
      <PostMedia media={post.media} locale={locale} onOpen={() => onOpenPost(post)} portrait={post.post_type === "abundance_story"} />
      <WishPostPreview
        copyingWishId={copyingWishId}
        currentUserId={currentUserId}
        locale={locale}
        post={post}
        t={t}
        onCopyWish={onCopyWish}
      />
      <ExternalLinkPreview post={post} locale={locale} t={t} />
      <footer>
        <span className={`post-status ${post.status}`}>{t(postStatusLabelKey(post.status))}</span>
        <div className="feed-card-actions">
          {showBlogAction && post.author_user_id ? (
            <button className="finance-small-icon-button" type="button" aria-label={t("social.feed.openBlog")} onClick={() => onOpenBlog(post.author_user_id!)}>
              <BookOpen size={15} />
            </button>
          ) : null}
          {showSystemProfileAction && post.systemStory ? (
            <button className="system-story-profile-link" type="button" onClick={() => onOpenSystemAccount(post.systemStory!.system_account_key)}>
              <BookOpen size={14} />
              {t("social.systemProfile.allChapters")}
            </button>
          ) : null}
          {post.status === "draft" ? (
            <button className="finance-small-icon-button primary" type="button" disabled={saving} aria-label={t("social.feed.publish")} onClick={() => onPublish(post)}>
              <Send size={15} />
            </button>
          ) : null}
          {canDelete ? (
            <button className="finance-small-icon-button danger" type="button" disabled={saving} aria-label={t("social.post.delete")} onClick={() => onDeletePost(post)}>
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

export function WishPostPreview({
  copyingWishId,
  currentUserId,
  hideCopy = false,
  locale,
  post,
  t,
  onCopyWish
}: {
  copyingWishId: string | null;
  currentUserId: string | null;
  hideCopy?: boolean;
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onCopyWish: (wish: PublicWish) => void;
}) {
  const wish = post.wish;
  if (!wish) return null;

  const canCopy = !hideCopy && wish.owner_user_id !== currentUserId;
  const isCopying = copyingWishId === wish.id;

  return (
    <section className="wish-post-preview">
      {wish.image_url ? <img alt="" src={wish.image_url} /> : <span className="wish-post-placeholder">{wish.title.slice(0, 1)}</span>}
      <div>
        <strong>{wish.title}</strong>
        {wish.description ? <p>{wish.description}</p> : null}
        <div className="public-wish-meta">
          {wish.target_amount ? <span>{formatWishAmount(wish, locale)}</span> : null}
          <span>{t("wishes.level", { level: wish.difficulty_level })}</span>
          <span>{t("wishes.copiedCount", { count: wish.copied_count })}</span>
        </div>
      </div>
      {canCopy ? (
        <button
          className="secondary-button"
          type="button"
          disabled={isCopying || wish.viewer_has_copy}
          onClick={() => onCopyWish(wish)}
        >
          <Copy size={15} />
          {wish.viewer_has_copy ? t("wishes.addedToMine") : isCopying ? t("wishes.saving") : t("wishes.addToMine")}
        </button>
      ) : null}
    </section>
  );
}

export function PostDetailModal({
  copyingWishId,
  currentUserId,
  readOnly = false,
  locale,
  post,
  t,
  onClose,
  onAddStoryWish,
  onCopyWish,
  onDeletePost,
  onOpenAuthor,
  onOpenBlog,
  onOpenChallenge,
  onOpenSystemAccount,
  onPublish,
  onUpdateCover,
  onUploadCover,
  onUpdateReview,
  onReposted,
  storyWishError = null,
  storyWishSaving = false,
  sequence
}: {
  sequence?: { index: number; total: number; onMove: (direction: 1 | -1) => boolean };
  copyingWishId: string | null;
  currentUserId: string | null;
  readOnly?: boolean;
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onClose: () => void;
  onAddStoryWish?: (post: FeedPost) => void;
  onCopyWish: (wish: PublicWish) => void;
  onDeletePost: (post: FeedPost) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenChallenge: () => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onPublish: (post: FeedPost) => void;
  onUpdateCover?: (post: FeedPost, templateKey: string) => void;
  onUploadCover?: (post: FeedPost, file: File) => void;
  onUpdateReview: (post: FeedPost, changes: ReviewEditPayload) => Promise<void>;
  onReposted?: () => void;
  storyWishError?: string | null;
  storyWishSaving?: boolean;
}) {
  const canDelete = !readOnly && Boolean(post.author_user_id) && post.author_user_id === currentUserId;
  const hasVisualMedia = post.media.some((item) => (item.media_type === "image" || item.media_type === "video") && Boolean(item.media_url));
  // A post with a video player shows only the player, not its still frame on top as well.
  const hasVideoEmbed = Boolean(post.externalLinks?.[0] ? videoEmbedFromUrl(post.externalLinks[0].external_url) || isShortVideoLink(post.externalLinks[0].external_url) : findVideoEmbeds(post.body, 1).length || findShortVideoLinks(post.body, 1).length);
  const fallbackCover = hasVisualMedia || hasVideoEmbed ? null : getFeedPostCover(post);
  // A video post opens as the player across the screen, with the author and date in one compact line below.
  const videoLayout = hasVideoEmbed && !hasVisualMedia && !post.projectReview;
  const hasDetailCover = hasVisualMedia || Boolean(fallbackCover) || videoLayout;
  const [editingReview, setEditingReview] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  // Same as every full-screen card: Back and a swipe from the left edge close it, the cross stays.
  const closeLayer = useHistoryLayer(true, onClose);
  const edgeSwipe = useEdgeSwipeBack(closeLayer);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeNotice, setSwipeNotice] = useState<string | null>(null);
  const [sequenceEnded, setSequenceEnded] = useState(false);
  const swipeSignals = Boolean(sequence && sequence.index >= 0 && canUseFeedSignals(currentUserId, post));
  const [showSwipeHint] = useState(() => typeof window !== "undefined" && !hasBeenSeen("feed-swipe-hint", "v1"));

  useEffect(() => {
    if (swipeSignals && showSwipeHint) markSeen("feed-swipe-hint", "v1");
  }, [swipeSignals, showSwipeHint]);

  useEffect(() => {
    sheetRef.current?.scrollTo?.({ top: 0 });
  }, [post.id]);

  function moveSequence(direction: 1 | -1) {
    if (!sequence) return;
    const moved = sequence.onMove(direction);
    setSequenceEnded(!moved && direction === 1);
  }

  useEffect(() => {
    if (!swipeNotice) return;
    const timer = window.setTimeout(() => setSwipeNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [swipeNotice]);

  function handleSwipe(direction: "left" | "right") {
    if (!sequence || sequence.index < 0) return;
    if (swipeSignals && currentUserId) {
      recordFeedSwipeSignal(currentUserId, post, direction === "right" ? "interest" : "not_for_me");
      setSwipeNotice(t(direction === "right" ? "social.feed.interestSaved" : "social.feed.notForMeSaved"));
      if (direction === "right") celebrate(sheetRef.current);
      moveSequence(1);
      return;
    }
    moveSequence(direction === "left" ? 1 : -1);
  }
  const [reviewDraft, setReviewDraft] = useState<ReviewEditPayload>({
    body: post.body ?? "",
    overallRating: post.projectReview?.overall_rating ?? 0,
    missionRating: post.projectReview?.mission_rating ?? 0,
    attitude: post.projectReview?.attitude ?? "",
    mostUsefulArea: post.projectReview?.most_useful_area ?? ""
  });

  const sequenceMoveRef = useRef<((direction: 1 | -1) => void) | null>(null);
  sequenceMoveRef.current = sequence ? moveSequence : null;

  async function saveReview() {
    setReviewSaving(true);
    try {
      await onUpdateReview(post, reviewDraft);
      setEditingReview(false);
    } catch {
      // The parent surfaces the API error without closing the editor.
    } finally {
      setReviewSaving(false);
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLayer();
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowRight") sequenceMoveRef.current?.(1);
      if (event.key === "ArrowLeft") sequenceMoveRef.current?.(-1);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeLayer]);

  return (
    <div className="modal-backdrop post-detail-backdrop" role="presentation" onClick={closeLayer}>
      <section
        ref={sheetRef}
        className={`modal-sheet post-detail-modal${hasDetailCover ? " has-media" : ""}${sequence ? " has-sequence" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={t("social.post.detail")}
        onClick={(event) => event.stopPropagation()}
        {...edgeSwipe}
        onPointerDown={(event) => {
          if (!sequence || event.pointerType === "mouse") return;
          // A swipe from the edge is Back, not a move to the next story.
          if (event.clientX <= 28 || event.clientX >= window.innerWidth - 4) return;
          if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
          swipeStartRef.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipeStartRef.current;
          swipeStartRef.current = null;
          if (!start) return;
          const direction = classifySwipe(event.clientX - start.x, event.clientY - start.y);
          if (direction) handleSwipe(direction);
        }}
        onPointerCancel={() => { swipeStartRef.current = null; }}
      >
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={closeLayer}>
          <X size={18} />
        </button>
        {sequence && sequence.index >= 0 ? (
          <div className="post-sequence-bar">
            <button type="button" aria-label={t("social.feed.previousStory")} disabled={sequence.index === 0} onClick={() => moveSequence(-1)}><ChevronLeft size={18} /></button>
            <span>{sequence.index + 1} / {sequence.total}</span>
            <button type="button" aria-label={t("social.feed.nextStory")} onClick={() => moveSequence(1)}><ChevronRight size={18} /></button>
          </div>
        ) : null}
        {sequenceEnded ? (
          <div className="post-sequence-end" role="status">
            <strong>{t("social.feed.sequenceEnd")}</strong>
            <button className="secondary-button" type="button" onClick={closeLayer}>{t("app.common.close")}</button>
          </div>
        ) : null}
        {swipeNotice ? <p className="post-swipe-notice" role="status">{swipeNotice}</p> : null}
        {swipeSignals && showSwipeHint ? <p className="post-swipe-hint">{t("social.feed.swipeHint")}</p> : null}
        {hasVisualMedia ? <PostMedia media={post.media} locale={locale} showSource /> : null}
        {fallbackCover ? <div className="post-detail-cover"><img alt="" src={fallbackCover} /></div> : null}
        {videoLayout ? <div className="post-detail-video"><ExternalLinkPreview post={post} locale={locale} t={t} /></div> : null}
        <div className="post-detail-content">
          {videoLayout ? null : <div className="post-detail-author-row">
            <PostAuthor detail post={post} t={t} onOpenAuthor={onOpenAuthor} onOpenSystemAccount={onOpenSystemAccount} />
            {post.author_user_id && currentUserId && post.post_type !== "reality_demo" && post.post_type !== "abundance_story" ? <FollowButton authorId={post.author_user_id} /> : null}
            {post.system_verified ? <span className="system-story-badge">{t("social.feed.verifiedBadge")}</span> : null}
            {post.post_type === "reality_demo" ? <span className="reality-demo-badge">{t("social.feed.demoBadge")}</span> : null}
            {post.post_type === "abundance_story" ? <span className="system-story-badge">{t("social.feed.systemStoryBadge")}</span> : null}
            {post.post_type === "project_review" ? <span className="project-review-badge">{t("social.review.badge")}</span> : null}
          </div>}
          {post.system_verified && post.verifiedChallenge ? <VerifiedChallengeMeta locale={locale} post={post} t={t} /> : null}
          {post.projectReview && !editingReview ? (
            <div className="project-review-detail-meta">
              <ReviewStars value={post.projectReview.overall_rating} />
              <span>{t("social.review.mission", { rating: post.projectReview.mission_rating })}</span>
              <span>{t(`appTesting.attitude.${post.projectReview.attitude}` as MessageKey)}</span>
              <span>{t(`appTesting.area.${post.projectReview.most_useful_area}` as MessageKey)}</span>
            </div>
          ) : null}
          {editingReview && post.projectReview ? (
            <div className="project-review-editor">
              <label>
                <span>{t("appTesting.overallRating")}</span>
                <select value={reviewDraft.overallRating} onChange={(event) => setReviewDraft((current) => ({ ...current, overallRating: Number(event.target.value) }))}>
                  {[1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating}/5</option>)}
                </select>
              </label>
              <label>
                <span>{t("appTesting.missionRating")}</span>
                <select value={reviewDraft.missionRating} onChange={(event) => setReviewDraft((current) => ({ ...current, missionRating: Number(event.target.value) }))}>
                  {[1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating}/5</option>)}
                </select>
              </label>
              <label>
                <span>{t("appTesting.attitude")}</span>
                <select value={reviewDraft.attitude} onChange={(event) => setReviewDraft((current) => ({ ...current, attitude: event.target.value }))}>
                  {APP_TESTING_ATTITUDES.map((attitude) => <option value={attitude} key={attitude}>{t(`appTesting.attitude.${attitude}` as MessageKey)}</option>)}
                </select>
              </label>
              <label>
                <span>{t("appTesting.mostUseful")}</span>
                <select value={reviewDraft.mostUsefulArea} onChange={(event) => setReviewDraft((current) => ({ ...current, mostUsefulArea: event.target.value }))}>
                  {APP_TESTING_USEFUL_AREAS.map((area) => <option value={area} key={area}>{t(`appTesting.area.${area}` as MessageKey)}</option>)}
                </select>
              </label>
              <label>
                <span>{t("appTesting.publicReview")}</span>
                <textarea maxLength={1500} value={reviewDraft.body} onChange={(event) => setReviewDraft((current) => ({ ...current, body: event.target.value }))} />
              </label>
              <div className="project-review-editor-actions">
                <button className="secondary-button" type="button" onClick={() => setEditingReview(false)}>{t("social.review.cancel")}</button>
                <button className="primary-button" type="button" disabled={reviewSaving || reviewDraft.body.trim().length < 100} onClick={() => { void saveReview(); }}>
                  {reviewSaving ? t("app.common.loading") : t("social.review.save")}
                </button>
              </div>
            </div>
          ) : videoLayout && !post.body?.trim() ? null : <p className="post-detail-body">{post.body ?? t("social.post.detail")}</p>}
          {post.projectReview && !editingReview ? <small className="project-review-reward-note">{t("social.review.rewarded", { reward: formatMoney(3, locale) })}</small> : null}
          {videoLayout ? (
            <div className="post-detail-video-meta">
              <PostAuthor post={post} t={t} onOpenAuthor={onOpenAuthor} onOpenSystemAccount={onOpenSystemAccount} />
              {post.system_verified ? <span className="system-story-badge">{t("social.feed.verifiedBadge")}</span> : null}
              <small>{post.status === "published" ? formatPostDate(post, locale) : `${t(postStatusLabelKey(post.status))} - ${formatPostDate(post, locale)}`}</small>
            </div>
          ) : <span className={`post-status ${post.status}`}>{t(postStatusLabelKey(post.status))} - {formatPostDate(post, locale)}</span>}
          <RepostSourcePreview post={post} locale={locale} t={t} />
          <StatBlockGrid blocks={post.statBlocks} locale={locale} t={t} />
          <WishPostPreview
            copyingWishId={copyingWishId}
            currentUserId={currentUserId}
            hideCopy={readOnly}
            locale={locale}
            post={post}
            t={t}
            onCopyWish={onCopyWish}
          />
          {videoLayout ? null : <ExternalLinkPreview post={post} locale={locale} t={t} />}
          <FeedPostInteractions currentUserId={currentUserId} locale={locale} post={post} t={t} onReposted={onReposted} />
          <FeedPostSignalButtons
            currentUserId={currentUserId}
            onAddStoryWish={readOnly ? undefined : onAddStoryWish}
            post={post}
            storyWishError={storyWishError}
            storyWishSaving={storyWishSaving}
            t={t}
          />
          <div className="post-detail-actions">
            {post.system_verified && post.verifiedChallenge ? (
              <button className="primary-button" type="button" onClick={() => { onClose(); onOpenChallenge(); }}>
                <Check size={15} />
                {t("social.feed.openChallenge")}
              </button>
            ) : null}
            {post.author_user_id ? (
              <button className="secondary-button" type="button" onClick={() => onOpenBlog(post.author_user_id!)}>
                <BookOpen size={16} />
                {t("social.feed.openBlog")}
              </button>
            ) : null}
            {post.systemStory ? (
              <button className="system-story-profile-link" type="button" onClick={() => onOpenSystemAccount(post.systemStory!.system_account_key)}>
                <BookOpen size={14} />
                {t("social.systemProfile.allChapters")}
              </button>
            ) : null}
            {canDelete && post.projectReview && !editingReview ? (
              <button className="secondary-button" type="button" onClick={() => setEditingReview(true)}>
                <Edit3 size={15} />
                {t("social.review.edit")}
              </button>
            ) : null}
            {!readOnly && post.status === "draft" ? (
              <button className="finance-small-icon-button primary" type="button" aria-label={t("social.feed.publish")} onClick={() => onPublish(post)}>
                <Send size={15} />
              </button>
            ) : null}
            {canDelete ? (
              <button className="finance-small-icon-button danger" type="button" aria-label={t("social.post.delete")} onClick={() => onDeletePost(post)}>
                <Trash2 size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

export function ExternalLinkPreview({ post, locale, t }: {
  post: FeedPost;
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  const externalLink = post.externalLinks?.[0];
  const embed = externalLink ? videoEmbedFromUrl(externalLink.external_url) : findVideoEmbeds(post.body, 1)[0];
  if (embed) {
    return (
      <VideoEmbedPlayer
        embed={embed}
        title={externalLink?.title ?? null}
        author={externalLink?.author_name ?? externalLink?.author_handle ?? null}
        thumbnailUrl={externalLink?.thumbnail_url ?? null}
        locale={locale}
        t={t}
      />
    );
  }
  const shortLink = externalLink ? (isShortVideoLink(externalLink.external_url) ? externalLink.external_url : null) : findShortVideoLinks(post.body, 1)[0];
  const card = externalLink ? (
    <a className="external-link-preview" href={externalLink.external_url} target="_blank" rel="noreferrer">
      <span>{formatProviderLabel(externalLink.provider)}</span>
      <strong>{externalLink.title ?? externalLink.external_url}</strong>
      {externalLink.author_handle ? <small>{externalLink.author_handle}</small> : null}
      <ExternalLink size={15} />
    </a>
  ) : null;
  if (shortLink) {
    return (
      <ShortLinkVideoEmbed
        url={shortLink}
        fallback={card}
        title={externalLink?.title ?? null}
        author={externalLink?.author_name ?? externalLink?.author_handle ?? null}
        thumbnailUrl={externalLink?.thumbnail_url ?? null}
        locale={locale}
        t={t}
      />
    );
  }
  return card;
}

export function RepostSourcePreview({
  locale,
  post,
  t
}: {
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  const source = post.repostOf;
  if (!source) return null;
  return (
    <section className="repost-source-preview">
      <small>{t("social.feed.repost")}</small>
      <strong>{source.authorName ?? t("social.feed.manualPost")}</strong>
      {source.body ? <p>{source.body}</p> : null}
      <PostMedia media={source.media} locale={locale} />
    </section>
  );
}

export function VerifiedChallengeMeta({
  locale,
  post,
  t
}: {
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  const challenge = post.verifiedChallenge;
  if (!challenge) return null;

  const title = localizedSystemBio(challenge.challenge_title, locale) || t("social.feed.challengeDone");
  const verificationType = t(verificationLabelKey(challenge.verification_type));

  return (
    <div className="verified-challenge-meta">
      <strong>{t("social.feed.challengeDone")}: {title}</strong>
      <span>{t("social.feed.challengeVerification", { type: verificationType })}</span>
      <span>{t("social.feed.challengeCompletedAt", { date: formatDate(challenge.completed_at, locale) })}</span>
    </div>
  );
}

export function StatBlockGrid({ blocks, locale, t }: { blocks: FeedStatBlock[]; locale: AppLocale; t: (key: MessageKey, values?: Record<string, string | number>) => string }) {
  if (!blocks.length) return null;
  return (
    <div className="post-stat-grid">
      {blocks.map((block) => (
        <span className={statBlockClassName(block, "post-stat-block")} key={block.id}>
          <small>{t(statBlockLabelKey(block.block_key))}</small>
          <strong>{formatStatBlockValue(block, locale)}</strong>
        </span>
      ))}
    </div>
  );
}

export function ReviewStars({ value }: { value: number }) {
  return (
    <span className="project-review-stars" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <Star size={16} fill={rating <= value ? "currentColor" : "none"} key={rating} />
      ))}
    </span>
  );
}

export function HistoryPanel({
  title,
  open,
  loading,
  error,
  emptyText,
  loadingText,
  rowCount,
  onToggle,
  children
}: {
  title: string;
  open: boolean;
  loading: boolean;
  error: string | null;
  emptyText: string;
  loadingText: string;
  rowCount: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  const hasRows = rowCount > 0;

  return (
    <section className="history-section">
      <button className="history-toggle" type="button" onClick={onToggle}>
        <span>{title}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open ? (
        <div className="history-body">
          {loading ? <p>{loadingText}</p> : null}
          {error ? <p className="finance-error">{error}</p> : null}
          {!error && hasRows ? children : null}
          {!loading && !error && !hasRows ? <p>{emptyText}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export function PostAuthor({
  detail = false,
  post,
  t,
  onOpenAuthor,
  onOpenSystemAccount
}: {
  detail?: boolean;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onOpenAuthor: (userId: string) => void;
  onOpenSystemAccount: (accountKey: string) => void;
}) {
  const isSystemStory = post.post_type === "abundance_story";
  const content = (
    <>
      <span className="feed-author-avatar">
        {isSystemStory ? <img alt="" src={post.systemStory?.account?.avatar_url ?? "/icons/twenty-levels-app-icon-192.png"} /> : post.author?.avatar_url ? <img alt="" src={post.author.avatar_url} style={{ objectPosition: post.author.avatar_position ?? "50% 50%" }} /> : <UserRound size={18} />}
      </span>
      {isSystemStory ? (
        <span>{post.systemStory?.account?.display_name ?? post.authorName ?? "Open Abundance"}</span>
      ) : (
        <UserNameWithLevel
          label={post.author ? t("profile.levelBadge", { level: post.author.level }) : undefined}
          level={post.author?.level}
        >
          {post.authorName ?? formatProfileName(post.author, post.author_user_id ?? "Open Abundance")}
        </UserNameWithLevel>
      )}
    </>
  );

  if (post.systemStory) {
    return (
      <button className={`feed-author${detail ? " detail-author" : ""}`} type="button" onClick={() => onOpenSystemAccount(post.systemStory!.system_account_key)}>
        {content}
      </button>
    );
  }

  if (!post.author_user_id) return <div className={`feed-author${detail ? " detail-author" : ""}`}>{content}</div>;

  return (
    <button className={`feed-author${detail ? " detail-author" : ""}`} type="button" onClick={() => { void onOpenAuthor(post.author_user_id!); }}>
      {content}
    </button>
  );
}

export function PostMedia({ media, locale, onOpen, portrait = false, showSource = false }: { media: FeedMedia[]; locale: AppLocale; onOpen?: () => void; portrait?: boolean; showSource?: boolean }) {
  const playableMedia = media.filter((item) => (item.media_type === "image" || item.media_type === "video") && Boolean(item.media_url));
  if (!playableMedia.length) return null;

  return (
    <div className={`feed-post-media${playableMedia.length > 1 ? " multiple" : ""}${portrait ? " portrait" : ""}`}>
      {playableMedia.map((item) => {
        const visual = item.media_type === "video"
          ? <video controls preload="metadata" src={item.media_url ?? undefined} />
          : <img alt={localizedMediaAlt(item.alt_text, locale)} loading="lazy" src={item.media_url ?? undefined} />;
        return onOpen ? (
          <button type="button" key={item.id} onClick={onOpen}>{visual}</button>
        ) : (
          <figure key={item.id}>
            {visual}
            {showSource && item.source_url ? (
              <figcaption>
                <a href={item.source_url} target="_blank" rel="noreferrer">{item.source_label ?? "Source"}</a>
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

export function TrustConfirmationsPanel({
  confirmations,
  currentUserId,
  locale,
  profiles,
  savingId,
  t,
  onConfirm,
  onDecline,
  onOpenProfile
}: {
  confirmations: TrustConfirmationRow[] | null;
  currentUserId: string;
  locale: AppLocale;
  profiles: Record<string, TeamProfile>;
  savingId: string | null;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onConfirm: (confirmationId: string) => void;
  onDecline: (confirmationId: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const pendingIncomingCount = confirmations?.filter((item) => item.counterparty_user_id === currentUserId && item.status === "pending").length ?? 0;
  const visibleConfirmations = (confirmations ?? []).slice(0, 8);

  return (
    <section className="public-profile-box trust-confirmations-box">
      <div className="section-heading-row">
        <span>{t("profile.trust.title")}</span>
        <strong>{pendingIncomingCount}</strong>
      </div>
      {!confirmations ? <p>{t("app.common.loading")}</p> : null}
      {confirmations && !visibleConfirmations.length ? <p>{t("profile.trust.empty")}</p> : null}
      {visibleConfirmations.length ? (
        <div className="trust-confirmation-list">
          {visibleConfirmations.map((confirmation) => {
            const isIncoming = confirmation.counterparty_user_id === currentUserId;
            const otherUserId = isIncoming ? confirmation.requester_user_id : confirmation.counterparty_user_id;
            const otherProfile = profiles[otherUserId] ?? null;
            const canRespond = isIncoming && confirmation.status === "pending";
            return (
              <article className={`trust-confirmation-row status-${confirmation.status}`} key={confirmation.id}>
                <div className="trust-confirmation-main">
                  <button className="trust-profile-button" type="button" onClick={() => onOpenProfile(otherUserId)}>
                    <UserNameWithLevel
                      label={otherProfile ? t("profile.levelBadge", { level: otherProfile.level }) : undefined}
                      level={otherProfile?.level}
                    >
                      {formatProfileName(otherProfile, otherUserId)}
                    </UserNameWithLevel>
                  </button>
                  <span className="trust-confirmation-meta">
                    {t(isIncoming ? "profile.trust.incoming" : "profile.trust.outgoing")} · {t(trustConfirmationTypeLabelKey(confirmation.confirmation_type))}
                  </span>
                  {confirmation.message ? <p>{confirmation.message}</p> : null}
                  <small>
                    {confirmation.status === "pending"
                      ? t("profile.trust.expires", { date: formatDate(confirmation.expires_at, locale) })
                      : formatDate(confirmation.responded_at ?? confirmation.updated_at, locale)}
                  </small>
                </div>
                <div className="trust-confirmation-side">
                  <span className="trust-status-pill">{t(trustConfirmationStatusLabelKey(confirmation.status))}</span>
                  {canRespond ? (
                    <div className="trust-confirmation-actions">
                      <button className="finance-small-icon-button primary" type="button" disabled={savingId === confirmation.id} aria-label={t("profile.trust.confirm")} onClick={() => onConfirm(confirmation.id)}>
                        <Check size={15} />
                      </button>
                      <button className="finance-small-icon-button" type="button" disabled={savingId === confirmation.id} aria-label={t("profile.trust.decline")} onClick={() => onDecline(confirmation.id)}>
                        <X size={15} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
