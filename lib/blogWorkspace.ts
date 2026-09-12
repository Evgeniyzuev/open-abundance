import type { FeedPost } from "@/lib/socialFeed";

export const BLOG_PAGE_SIZE = 18;

// A timestamp alone skips records when several daily events have the same time.
export function encodeBlogCursor(post: Pick<FeedPost, "created_at" | "id">): string {
  return `${post.created_at}|${post.id}`;
}

export function decodeBlogCursor(value: string | null): { createdAt: string; id: string } | null {
  if (!value) return null;
  const [createdAt, id, extra] = value.split("|");
  if (extra !== undefined || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(createdAt)
    || !Number.isFinite(Date.parse(createdAt)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id ?? "")) return null;
  return { createdAt, id };
}

export function mergeBlogPosts(previous: FeedPost[], incoming: FeedPost[]): FeedPost[] {
  const byId = new Map(previous.map((post) => [post.id, post]));
  incoming.forEach((post) => byId.set(post.id, post));
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

export function isPublicBlogPost(post: { status: string; visibility: string; deleted_at: string | null }): boolean {
  return post.status === "published" && post.visibility === "public" && post.deleted_at === null;
}
