"use client";

import FeedPostInteractions from "@/components/FeedPostInteractions";
import MentionText from "@/components/MentionText";
import { useUserContext } from "@/components/UserProvider";
import type { FeedPost } from "@/lib/socialFeed";

export type DiscussionPost = {
  id: string;
  authorUserId: string | null;
  authorName: string;
  authorUsername: string | null;
  postType: string;
  title: string | null;
  body: string | null;
  cover: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export default function PostDiscussion({ post }: { post: DiscussionPost }) {
  const { authResolved, locale, t, user } = useUserContext();
  const authorHref = post.authorUsername ? `/@${post.authorUsername}` : post.authorUserId ? `/u/${post.authorUserId}` : null;
  return (
    <main className="discussion-page">
      <div>
        <header>
          <a href="/">Open Abundance</a>
          <span>{t("social.feed.discussionTitle")}</span>
        </header>
        <article className="discussion-post">
          {post.cover ? <img className="discussion-cover" src={post.cover} alt="" /> : null}
          {post.title ? <h1>{post.title}</h1> : null}
          {post.body ? <p className="discussion-post-body"><MentionText text={post.body} /></p> : null}
          <span className="discussion-author">{authorHref ? <a href={authorHref}>{post.authorName}</a> : post.authorName}</span>
        </article>
        {user ? (
          <FeedPostInteractions currentUserId={user.id} locale={locale} post={toFeedPost(post)} t={t} full />
        ) : authResolved ? (
          <a className="primary-button" href="/">{t("social.feed.discussionSignIn")}</a>
        ) : null}
      </div>
    </main>
  );
}

function toFeedPost(post: DiscussionPost): FeedPost {
  return {
    id: post.id, author_user_id: post.authorUserId, author_label: null, authorName: post.authorName, source_key: null, snapshot_id: null,
    post_type: post.postType, status: "published", visibility: "public", body: post.body, title: post.title,
    created_at: post.createdAt, updated_at: post.updatedAt, published_at: post.publishedAt, deleted_at: null,
    author: null, statBlocks: [], externalLinks: [], media: [], wish: null, projectReview: null, systemStory: null
  };
}
