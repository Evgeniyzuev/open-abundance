import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database, Tables, TablesInsert } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import type { FeedRepostSource } from "@/lib/socialFeed";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type FeedPostRow = Tables<"feed_posts">;
type FeedPostEntityRow = Tables<"feed_post_entities">;
type FeedStatBlockRow = Tables<"feed_post_stat_blocks">;
type FeedExternalLinkRow = Tables<"feed_post_external_links">;
type FeedMediaRow = Tables<"feed_post_media">;
type FeedRepostRow = Pick<FeedPostRow, "id" | "author_user_id" | "author_label" | "post_type" | "body" | "status" | "visibility" | "deleted_at">;
type FeedTranslationRow = Tables<"feed_post_translations">;
type FeedSystemAccountRow = Tables<"feed_system_accounts">;
type FeedSystemStoryMetadataRow = Tables<"feed_system_story_metadata">;
type FeedChallengeCompletionSnapshotRow = Pick<
  Tables<"challenge_completion_snapshots">,
  "id" | "challenge_id" | "challenge_title" | "challenge_category" | "verification_type" | "completed_at" | "feed_post_id"
>;
type FeedProjectReviewMetadataRow = Pick<
  Tables<"feed_project_review_metadata">,
  "post_id" | "overall_rating" | "mission_rating" | "attitude" | "most_useful_area" | "challenge_reward_amount" | "created_at" | "updated_at"
>;
type FeedWishRow = Tables<"wishes"> & { viewer_has_copy: boolean };
type FeedProfile = Pick<Tables<"user_profiles">, "user_id" | "username" | "display_name" | "avatar_url" | "avatar_position" | "level" | "created_at">;
type ExternalProvider = "tiktok" | "instagram" | "telegram" | "youtube" | "x" | "website" | "unknown";
type CreateExternalLinkBody = {
  url?: unknown;
};
type NormalizedExternalLink = {
  provider: ExternalProvider;
  externalUrl: string;
  externalPostId: string | null;
  authorHandle: string | null;
  title: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const requestedScope = request.nextUrl.searchParams.get("scope");
    const scope = requestedScope === "blog" ? "blog" : requestedScope === "system" ? "system" : "feed";
    const locale = normalizeLocale(request.nextUrl.searchParams.get("locale"));
    const requestedAuthorId = normalizeUuid(request.nextUrl.searchParams.get("authorUserId"));
    const authorUserId = scope === "blog" ? requestedAuthorId ?? user.id : null;
    const systemAccountKey = scope === "system" ? normalizeSystemAccountKey(request.nextUrl.searchParams.get("systemAccountKey")) : null;
    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
    const category = normalizeFeedCategory(request.nextUrl.searchParams.get("category"));
    const postType = scope === "feed" && request.nextUrl.searchParams.get("postType") === "project_review" ? "project_review" : null;
    const systemDraftsOnly = scope === "blog" && request.nextUrl.searchParams.get("drafts") === "system";
    const cursor = scope === "feed" ? normalizeCursor(request.nextUrl.searchParams.get("cursor")) : null;

    let systemAccount: FeedSystemAccountRow | null = null;
    let systemStoryMetadata: FeedSystemStoryMetadataRow[] = [];

    if (scope === "system" && systemAccountKey) {
      const [{ data: account, error: accountError }, { data: metadata, error: metadataError }] = await Promise.all([
        supabase
          .from("feed_system_accounts")
          .select("*")
          .eq("account_key", systemAccountKey)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("feed_system_story_metadata")
          .select("*")
          .eq("system_account_key", systemAccountKey)
          .order("series_key", { ascending: true })
          .order("series_order", { ascending: true })
          .limit(limit)
      ]);

      if (accountError) throw accountError;
      if (metadataError) throw metadataError;
      if (!account) return NextResponse.json({ error: "System account not found." }, { status: 404, headers: NO_STORE_HEADERS });
      systemAccount = account as FeedSystemAccountRow;
      systemStoryMetadata = (metadata ?? []) as FeedSystemStoryMetadataRow[];
    }

    let query = supabase
      .from("feed_posts")
      .select("id,author_user_id,author_label,source_key,snapshot_id,system_verified,post_type,status,visibility,body,created_at,updated_at,published_at,deleted_at,repost_of_post_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(scope === "feed" ? limit + 1 : limit);

    if (scope === "feed") {
      query = query.eq("status", "published").eq("visibility", "public");
      if (postType) query = query.eq("post_type", postType);
      if (category === "stories") query = query.in("post_type", ["manual", "external_link", "wish", "reality_demo", "abundance_story"]);
      if (category === "system") query = query.in("post_type", ["daily_progress", "level_up", "wish_completed", "challenge"]);
      if (category === "reviews") query = query.eq("post_type", "project_review");
      if (cursor) query = query.lt("created_at", cursor);
    } else if (scope === "system") {
      const systemPostIds = systemStoryMetadata.map((item) => item.post_id);
      query = query
        .in("id", systemPostIds.length ? systemPostIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("post_type", "abundance_story")
        .eq("status", "published")
        .eq("visibility", "public");
    } else if (systemDraftsOnly && authorUserId === user.id) {
      query = query
        .eq("author_user_id", authorUserId)
        .eq("status", "draft")
        .in("post_type", ["daily_progress", "level_up", "wish_completed", "challenge"]);
    } else if (authorUserId === user.id) {
      query = query.eq("author_user_id", authorUserId);
    } else if (authorUserId) {
      query = query
        .eq("author_user_id", authorUserId)
        .eq("status", "published")
        .eq("visibility", "public");
    }

    const { data: posts, error: postsError } = await query;
    if (postsError) return NextResponse.json({ error: postsError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const hasMore = scope === "feed" && (posts?.length ?? 0) > limit;
    const rawPostRows = ((posts ?? []) as FeedPostRow[]).slice(0, limit);
    if (scope !== "system") {
      systemStoryMetadata = await loadSystemStoryMetadata(supabase, rawPostRows.map((post) => post.id));
    }
    const systemStoryMetadataByPostId = new Map(systemStoryMetadata.map((item) => [item.post_id, item]));
    const postRows = scope === "system"
      ? [...rawPostRows].sort((left, right) => (systemStoryMetadataByPostId.get(left.id)?.series_order ?? 0) - (systemStoryMetadataByPostId.get(right.id)?.series_order ?? 0))
      : rawPostRows;
    const postIds = postRows.map((post) => post.id);
    const repostSourceIds = Array.from(new Set(postRows.map((post) => post.repost_of_post_id).filter(isString)));
    const systemAccountKeys = Array.from(new Set(systemStoryMetadata.map((item) => item.system_account_key)));
    const [profiles, statBlocks, externalLinks, wishPosts, translations, media, systemAccounts, reviewMetadata, reviewSummary, challengeSnapshots, repostSources] = await Promise.all([
      loadProfiles(supabase, Array.from(new Set(postRows.map((post) => post.author_user_id).filter(isString)))),
      loadStatBlocks(supabase, postRows.map((post) => post.id), scope === "blog" && authorUserId === user.id),
      loadExternalLinks(supabase, postIds),
      loadWishPosts(supabase, postIds, user.id),
      loadTranslations(supabase, postIds, locale),
      loadMedia(supabase, postIds),
      loadSystemAccounts(supabase, systemAccountKeys),
      loadProjectReviewMetadata(supabase, postIds),
      category === "reviews" || postType === "project_review" ? loadProjectReviewSummary(supabase) : Promise.resolve(null),
      loadChallengeCompletionSnapshots(supabase, postIds),
      loadRepostSources(supabase, repostSourceIds, locale)
    ]);
    const systemAccountsByKey = new Map(systemAccounts.map((account) => [account.account_key, account]));
    const challengeSnapshotsByPostId = new Map(
      challengeSnapshots
        .filter((snapshot): snapshot is FeedChallengeCompletionSnapshotRow & { feed_post_id: string } => Boolean(snapshot.feed_post_id))
        .map((snapshot) => [snapshot.feed_post_id, {
          snapshot_id: snapshot.id,
          challenge_id: snapshot.challenge_id,
          challenge_title: snapshot.challenge_title,
          challenge_category: snapshot.challenge_category,
          verification_type: snapshot.verification_type,
          completed_at: snapshot.completed_at
        }])
    );
    const visiblePostRows = postRows.filter((post) => post.post_type !== "wish" || wishPosts.has(post.id));

    const authorProfile = authorUserId ? profiles.find((item) => item.user_id === authorUserId) ?? null : null;

    return NextResponse.json(
      {
        scope,
        category,
        postType,
        author: authorProfile,
        systemAccount,
        nextCursor: hasMore ? rawPostRows.at(-1)?.created_at ?? null : null,
        reviewSummary,
        posts: visiblePostRows.map((post) => {
          const translation = translations.get(post.id) ?? null;
          const systemStory = systemStoryMetadataByPostId.get(post.id) ?? null;
          return {
            ...post,
            body: translation?.body ?? post.body,
            authorName: translation?.author_name ?? post.author_label,
            author: profiles.find((item) => item.user_id === post.author_user_id) ?? null,
            statBlocks: filterStatBlocksForViewer(post, statBlocks, user.id),
            externalLinks: externalLinks.filter((link) => link.post_id === post.id),
            media: media.filter((item) => item.post_id === post.id),
            wish: wishPosts.get(post.id) ?? null,
            projectReview: reviewMetadata.get(post.id) ?? null,
            verifiedChallenge: challengeSnapshotsByPostId.get(post.id) ?? null,
            repostOf: post.repost_of_post_id ? repostSources.get(post.repost_of_post_id) ?? null : null,
            systemStory: systemStory ? {
              ...systemStory,
              account: systemAccountsByKey.get(systemStory.system_account_key) ?? systemAccount
            } : null
          };
        })
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load social feed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = await readCreateExternalLinkBody(request);
    const normalized = normalizeExternalUrl(body.url);
    if (!normalized) {
      return NextResponse.json({ error: "Paste a valid http or https URL." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const existingPost = await findExistingExternalPost(supabase, user.id, normalized);
    if (existingPost) {
      return NextResponse.json({ post: existingPost, created: false }, { headers: NO_STORE_HEADERS });
    }

    const now = new Date().toISOString();
    const { data: post, error: postError } = await supabase
      .from("feed_posts")
      .insert({
        author_user_id: user.id,
        post_type: "external_link",
        status: "published",
        visibility: "public",
        body: buildExternalPostBody(normalized),
        published_at: now
      } satisfies TablesInsert<"feed_posts">)
      .select("*")
      .single();

    if (postError) return NextResponse.json({ error: postError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const { data: externalLink, error: externalLinkError } = await supabase
      .from("feed_post_external_links")
      .insert({
        post_id: post.id,
        provider: normalized.provider,
        external_url: normalized.externalUrl,
        external_post_id: normalized.externalPostId,
        author_handle: normalized.authorHandle,
        title: normalized.title,
        embed_status: "link_only",
        relation: "source"
      } satisfies TablesInsert<"feed_post_external_links">)
      .select("*")
      .single();

    if (externalLinkError) {
      await supabase
        .from("feed_posts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", post.id);
      return NextResponse.json({ error: externalLinkError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const profiles = await loadProfiles(supabase, [user.id]);
    return NextResponse.json(
      {
        post: {
          ...post,
          authorName: null,
          author: profiles.find((item) => item.user_id === post.author_user_id) ?? null,
          statBlocks: [],
          externalLinks: [externalLink],
          media: [],
          wish: null,
          systemStory: null
        },
        created: true
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create external link post." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function loadWishPosts(supabase: SupabaseClient<Database>, postIds: string[], viewerUserId: string): Promise<Map<string, FeedWishRow>> {
  const result = new Map<string, FeedWishRow>();
  if (!postIds.length) return result;

  const { data: entities, error: entitiesError } = await supabase
    .from("feed_post_entities")
    .select("*")
    .in("post_id", postIds)
    .eq("entity_type", "wish")
    .eq("relation", "primary");

  if (entitiesError) throw entitiesError;
  const entityRows = (entities ?? []) as FeedPostEntityRow[];
  const wishIds = Array.from(new Set(entityRows.map((entity) => entity.entity_id)));
  if (!wishIds.length) return result;

  const { data: wishes, error: wishesError } = await supabase
    .from("wishes")
    .select("*")
    .in("id", wishIds)
    .eq("visibility", "public")
    .in("status", ["active", "completed"])
    .is("deleted_at", null);

  if (wishesError) throw wishesError;
  const wishRows = (wishes ?? []) as Tables<"wishes">[];
  if (!wishRows.length) return result;

  const copiedWishIds = await loadCopiedWishIds(supabase, wishRows, viewerUserId);
  const wishesById = new Map(
    wishRows.map((wish) => [
      wish.id,
      {
        ...wish,
        viewer_has_copy: wish.owner_user_id === viewerUserId || copiedWishIds.has(wish.id) || copiedWishIds.has(wish.original_wish_id ?? wish.id)
      }
    ])
  );

  entityRows.forEach((entity) => {
    const wish = wishesById.get(entity.entity_id);
    if (wish) result.set(entity.post_id, wish);
  });

  return result;
}

async function loadCopiedWishIds(supabase: SupabaseClient<Database>, wishes: Tables<"wishes">[], viewerUserId: string): Promise<Set<string>> {
  const copiedIds = new Set<string>();
  const sourceWishIds = wishes.map((wish) => wish.id);
  const originalWishIds = Array.from(new Set(wishes.map((wish) => wish.original_wish_id ?? wish.id)));

  const [directCopies, originalCopies] = await Promise.all([
    supabase
      .from("wishes")
      .select("cloned_from_wish_id")
      .eq("owner_user_id", viewerUserId)
      .is("deleted_at", null)
      .in("cloned_from_wish_id", sourceWishIds),
    supabase
      .from("wishes")
      .select("original_wish_id")
      .eq("owner_user_id", viewerUserId)
      .is("deleted_at", null)
      .in("original_wish_id", originalWishIds)
  ]);

  if (directCopies.error) throw directCopies.error;
  if (originalCopies.error) throw originalCopies.error;

  (directCopies.data ?? []).forEach((wish) => {
    if (wish.cloned_from_wish_id) copiedIds.add(wish.cloned_from_wish_id);
  });
  (originalCopies.data ?? []).forEach((wish) => {
    if (wish.original_wish_id) copiedIds.add(wish.original_wish_id);
  });

  return copiedIds;
}

async function loadProfiles(supabase: SupabaseClient<Database>, userIds: string[]): Promise<FeedProfile[]> {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,username,display_name,avatar_url,avatar_position,level,created_at")
    .in("user_id", userIds);

  if (error) throw error;
  return (data ?? []) as FeedProfile[];
}

async function loadStatBlocks(
  supabase: SupabaseClient<Database>,
  postIds: string[],
  includePrivate: boolean
): Promise<FeedStatBlockRow[]> {
  if (!postIds.length) return [];

  let query = supabase
    .from("feed_post_stat_blocks")
    .select("*")
    .in("post_id", postIds)
    .order("sort_order", { ascending: true });

  if (!includePrivate) {
    query = query.eq("visibility", "public");
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FeedStatBlockRow[];
}

async function loadExternalLinks(supabase: SupabaseClient<Database>, postIds: string[]): Promise<FeedExternalLinkRow[]> {
  if (!postIds.length) return [];

  const { data, error } = await supabase
    .from("feed_post_external_links")
    .select("*")
    .in("post_id", postIds)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as FeedExternalLinkRow[];
}

async function loadTranslations(
  supabase: SupabaseClient<Database>,
  postIds: string[],
  locale: "ru" | "en"
): Promise<Map<string, FeedTranslationRow>> {
  if (!postIds.length) return new Map();

  const { data, error } = await supabase
    .from("feed_post_translations")
    .select("*")
    .in("post_id", postIds)
    .eq("locale", locale);

  if (error) throw error;
  return new Map(((data ?? []) as FeedTranslationRow[]).map((translation) => [translation.post_id, translation]));
}

async function loadMedia(supabase: SupabaseClient<Database>, postIds: string[]): Promise<FeedMediaRow[]> {
  if (!postIds.length) return [];

  const { data, error } = await supabase
    .from("feed_post_media")
    .select("*")
    .in("post_id", postIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as FeedMediaRow[];
  const storageRows = rows.filter((row) => row.storage_path);
  if (!storageRows.length || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return rows;

  const storageClient = createClient<Database>(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const signedEntries = await Promise.all(storageRows.map(async (row) => {
    const result = await storageClient.storage.from("feed-media").createSignedUrl(row.storage_path!, 60 * 60);
    return [row.storage_path!, result.data?.signedUrl ?? null] as const;
  }));
  const signedByPath = new Map(signedEntries);
  return rows.map((row) => row.storage_path
    ? { ...row, media_url: signedByPath.get(row.storage_path) ?? row.media_url }
    : row);
}

async function loadSystemStoryMetadata(
  supabase: SupabaseClient<Database>,
  postIds: string[]
): Promise<FeedSystemStoryMetadataRow[]> {
  if (!postIds.length) return [];

  const { data, error } = await supabase
    .from("feed_system_story_metadata")
    .select("*")
    .in("post_id", postIds);

  if (error) throw error;
  return (data ?? []) as FeedSystemStoryMetadataRow[];
}

async function loadProjectReviewMetadata(
  supabase: SupabaseClient<Database>,
  postIds: string[]
): Promise<Map<string, FeedProjectReviewMetadataRow>> {
  if (!postIds.length) return new Map();

  const { data, error } = await supabase
    .from("feed_project_review_metadata")
    .select("post_id,overall_rating,mission_rating,attitude,most_useful_area,challenge_reward_amount,created_at,updated_at")
    .in("post_id", postIds);

  if (error) throw error;
  return new Map(((data ?? []) as FeedProjectReviewMetadataRow[]).map((item) => [item.post_id, item]));
}

async function loadRepostSources(
  supabase: SupabaseClient<Database>,
  postIds: string[],
  locale: "ru" | "en"
): Promise<Map<string, FeedRepostSource>> {
  if (!postIds.length) return new Map();

  const { data, error } = await supabase
    .from("feed_posts")
    .select("id,author_user_id,author_label,post_type,body,status,visibility,deleted_at")
    .in("id", postIds)
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null);
  if (error) throw error;

  const rows = (data ?? []) as FeedRepostRow[];
  const [profiles, translations, media] = await Promise.all([
    loadProfiles(supabase, Array.from(new Set(rows.map((post) => post.author_user_id).filter(isString)))),
    loadTranslations(supabase, rows.map((post) => post.id), locale),
    loadMedia(supabase, rows.map((post) => post.id))
  ]);

  return new Map(rows.map((post) => {
    const author = profiles.find((profile) => profile.user_id === post.author_user_id) ?? null;
    const translation = translations.get(post.id);
    return [post.id, {
      id: post.id,
      author_user_id: post.author_user_id,
      authorName: translation?.author_name ?? post.author_label,
      author,
      body: translation?.body ?? post.body,
      postType: post.post_type,
      media: media.filter((item) => item.post_id === post.id)
    }] satisfies [string, FeedRepostSource];
  }));
}

async function loadChallengeCompletionSnapshots(
  supabase: SupabaseClient<Database>,
  postIds: string[]
): Promise<FeedChallengeCompletionSnapshotRow[]> {
  if (!postIds.length) return [];

  const { data, error } = await supabase
    .from("challenge_completion_snapshots")
    .select("id,challenge_id,challenge_title,challenge_category,verification_type,completed_at,feed_post_id")
    .in("feed_post_id", postIds);

  if (error) throw error;
  return (data ?? []) as FeedChallengeCompletionSnapshotRow[];
}

async function loadProjectReviewSummary(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.rpc("get_project_review_summary");
  if (error) throw error;
  const summary = data?.[0];
  return {
    average: Number(summary?.average_rating ?? 0),
    count: Number(summary?.review_count ?? 0),
    distribution: {
      1: Number(summary?.star_1_count ?? 0),
      2: Number(summary?.star_2_count ?? 0),
      3: Number(summary?.star_3_count ?? 0),
      4: Number(summary?.star_4_count ?? 0),
      5: Number(summary?.star_5_count ?? 0)
    }
  };
}

async function loadSystemAccounts(
  supabase: SupabaseClient<Database>,
  accountKeys: string[]
): Promise<FeedSystemAccountRow[]> {
  if (!accountKeys.length) return [];

  const { data, error } = await supabase
    .from("feed_system_accounts")
    .select("*")
    .in("account_key", accountKeys)
    .eq("is_active", true);

  if (error) throw error;
  return (data ?? []) as FeedSystemAccountRow[];
}

async function findExistingExternalPost(
  supabase: SupabaseClient<Database>,
  userId: string,
  normalized: NormalizedExternalLink
): Promise<(FeedPostRow & {
  authorName: string | null;
  author: FeedProfile | null;
  statBlocks: FeedStatBlockRow[];
  externalLinks: FeedExternalLinkRow[];
  media: FeedMediaRow[];
  wish: null;
}) | null> {
  const { data: links, error: linksError } = await supabase
    .from("feed_post_external_links")
    .select("*")
    .eq("provider", normalized.provider)
    .eq("external_url", normalized.externalUrl)
    .eq("relation", "source");

  if (linksError) throw linksError;
  const postIds = (links ?? []).map((link) => link.post_id);
  if (!postIds.length) return null;

  const { data: posts, error: postsError } = await supabase
    .from("feed_posts")
    .select("*")
    .in("id", postIds)
    .eq("author_user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (postsError) throw postsError;
  const post = (posts ?? [])[0] as FeedPostRow | undefined;
  if (!post) return null;

  const profiles = await loadProfiles(supabase, post.author_user_id ? [post.author_user_id] : []);
  return {
    ...post,
    authorName: post.author_label,
    author: profiles.find((item) => item.user_id === post.author_user_id) ?? null,
    statBlocks: [],
    externalLinks: (links ?? []).filter((link) => link.post_id === post.id) as FeedExternalLinkRow[],
    media: [],
    wish: null
  };
}

async function readCreateExternalLinkBody(request: NextRequest): Promise<CreateExternalLinkBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function normalizeExternalUrl(value: unknown): NormalizedExternalLink | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  parsed.protocol = "https:";
  parsed.hash = "";
  removeTrackingParams(parsed);

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = parsed.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  const provider = detectProvider(host);
  const metadata = extractExternalMetadata(provider, parsed, pathParts);

  return {
    provider,
    externalUrl: parsed.toString(),
    externalPostId: metadata.externalPostId,
    authorHandle: metadata.authorHandle,
    title: metadata.title
  };
}

function detectProvider(host: string): ExternalProvider {
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "t.me" || host === "telegram.me") return "telegram";
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) return "youtube";
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com")) return "x";
  return "website";
}

function extractExternalMetadata(
  provider: ExternalProvider,
  url: URL,
  pathParts: string[]
): { externalPostId: string | null; authorHandle: string | null; title: string } {
  if (provider === "tiktok") {
    const author = pathParts.find((part) => part.startsWith("@")) ?? null;
    const videoIndex = pathParts.findIndex((part) => part === "video" || part === "photo");
    return {
      externalPostId: videoIndex >= 0 ? pathParts[videoIndex + 1] ?? null : null,
      authorHandle: author,
      title: "TikTok post"
    };
  }

  if (provider === "instagram") {
    const typeIndex = pathParts.findIndex((part) => ["p", "reel", "tv"].includes(part));
    const storyIndex = pathParts.findIndex((part) => part === "stories");
    return {
      externalPostId: typeIndex >= 0 ? pathParts[typeIndex + 1] ?? null : storyIndex >= 0 ? pathParts[storyIndex + 2] ?? null : null,
      authorHandle: storyIndex >= 0 ? pathParts[storyIndex + 1] ?? null : null,
      title: "Instagram post"
    };
  }

  if (provider === "telegram") {
    return {
      externalPostId: pathParts.length >= 2 ? `${pathParts[0]}/${pathParts[1]}` : pathParts[0] ?? null,
      authorHandle: pathParts[0] ? `@${pathParts[0]}` : null,
      title: "Telegram post"
    };
  }

  if (provider === "youtube") {
    const videoId = url.hostname.toLowerCase().replace(/^www\./, "") === "youtu.be"
      ? pathParts[0] ?? null
      : url.searchParams.get("v") ?? (pathParts[0] === "shorts" || pathParts[0] === "embed" ? pathParts[1] ?? null : null);
    return {
      externalPostId: videoId,
      authorHandle: pathParts[0]?.startsWith("@") ? pathParts[0] : null,
      title: "YouTube video"
    };
  }

  if (provider === "x") {
    const statusIndex = pathParts.findIndex((part) => part === "status");
    return {
      externalPostId: statusIndex >= 0 ? pathParts[statusIndex + 1] ?? null : null,
      authorHandle: pathParts[0] ? `@${pathParts[0]}` : null,
      title: "X post"
    };
  }

  return {
    externalPostId: null,
    authorHandle: null,
    title: url.hostname.replace(/^www\./, "")
  };
}

function removeTrackingParams(url: URL) {
  Array.from(url.searchParams.keys()).forEach((key) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith("utm_") || ["fbclid", "gclid", "igshid", "si"].includes(normalizedKey)) {
      url.searchParams.delete(key);
    }
  });
}

function buildExternalPostBody(link: NormalizedExternalLink): string {
  const handle = link.authorHandle ? ` ${link.authorHandle}` : "";
  return `${link.title}${handle}`;
}

function filterStatBlocksForViewer(post: FeedPostRow, statBlocks: FeedStatBlockRow[], viewerUserId: string): FeedStatBlockRow[] {
  const postBlocks = statBlocks.filter((block) => block.post_id === post.id);
  if (post.status !== "published" && post.author_user_id === viewerUserId) return postBlocks;
  return postBlocks.filter((block) => block.visibility === "public");
}

function clampLimit(value: string | null): number {
  if (value === null || value === undefined) return 30;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(60, Math.floor(parsed)));
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function normalizeSystemAccountKey(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9_]{1,64}$/.test(value)) return "abundance_system";
  return value;
}

function normalizeLocale(value: unknown): "ru" | "en" {
  return value === "en" ? "en" : "ru";
}

function normalizeCursor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeFeedCategory(value: unknown): "all" | "stories" | "system" | "reviews" {
  return value === "stories" || value === "system" || value === "reviews" ? value : "all";
}

function isString(value: string | null): value is string {
  return typeof value === "string";
}
