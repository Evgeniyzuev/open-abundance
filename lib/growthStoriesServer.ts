// Server read for /stories. Uses the service client and returns only what the authors already
// published as public reality posts and their public blocks: no balances, contacts or private wishes.
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { addDays, buildRealityDays, type RealityDayRow } from "@/lib/realityTimeline";
import { buildGrowthStory, rankGrowthStories, readStoryWins, STORY_WINDOW_DAYS, type GrowthStory, type StoryWins } from "@/lib/growthStories";

const POST_LIMIT = 3000;
const CHUNK = 200;

type PostRow = { id: string; author_user_id: string; post_type: string; body: string | null; snapshot_id: string | null; published_at: string | null; created_at: string };

export async function loadGrowthStories(today = new Date().toISOString().slice(0, 10)): Promise<GrowthStory[]> {
  const db = serviceClient();
  if (!db) return [];
  // One extra day covers posts created after midnight for the previous day's snapshot.
  const since = `${addDays(today, -STORY_WINDOW_DAYS)}T00:00:00Z`;
  const { data: posts, error } = await db
    .from("feed_posts")
    .select("id,author_user_id,post_type,body,snapshot_id,published_at,created_at")
    .in("post_type", ["daily_progress", "level_up"])
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(POST_LIMIT);
  if (error || !posts?.length) return [];
  const rows = posts as PostRow[];

  const postIds = rows.map((post) => post.id);
  const snapshotIds = rows.map((post) => post.snapshot_id).filter((id): id is string => Boolean(id));
  const authorIds = Array.from(new Set(rows.map((post) => post.author_user_id)));
  const [blocks, snapshots, profiles, humanity] = await Promise.all([
    selectChunked(db, "feed_post_stat_blocks", "post_id,block_key,value", "post_id", postIds, (query: any) => query.eq("visibility", "public")),
    selectChunked(db, "progress_snapshots", "id,source_date", "id", snapshotIds),
    selectChunked(db, "user_profiles", "user_id,username,display_name,level,deleted_at", "user_id", authorIds),
    selectChunked(db, "humanity_verifications", "user_id,humanity_level", "user_id", authorIds)
  ]);

  const dateBySnapshot = new Map<string, string>(snapshots.map((row: any) => [row.id, row.source_date]));
  const blocksByPost = new Map<string, Array<{ key: string; value: unknown }>>();
  for (const block of blocks as Array<{ post_id: string; block_key: string; value: unknown }>) {
    const list = blocksByPost.get(block.post_id) ?? [];
    list.push({ key: block.block_key, value: block.value });
    blocksByPost.set(block.post_id, list);
  }
  const profileById = new Map<string, any>(profiles.filter((row: any) => !row.deleted_at).map((row: any) => [row.user_id, row]));
  const humanityById = new Map<string, number>(humanity.map((row: any) => [row.user_id, Number(row.humanity_level ?? 0)]));

  const rowsByAuthor = new Map<string, RealityDayRow[]>();
  for (const post of rows) {
    if (!profileById.has(post.author_user_id)) continue;
    const list = rowsByAuthor.get(post.author_user_id) ?? [];
    list.push({
      postId: post.id,
      postType: post.post_type,
      body: post.body,
      date: (post.snapshot_id && dateBySnapshot.get(post.snapshot_id)) || (post.published_at ?? post.created_at).slice(0, 10),
      cover: null,
      blocks: blocksByPost.get(post.id) ?? []
    });
    rowsByAuthor.set(post.author_user_id, list);
  }

  const stories: GrowthStory[] = [];
  for (const [authorId, authorRows] of Array.from(rowsByAuthor.entries())) {
    const days = buildRealityDays(authorRows);
    const keptPosts = new Set(days.map((day) => day.postId));
    const wins: StoryWins[] = authorRows
      .filter((row) => keptPosts.has(row.postId))
      .map((row) => readStoryWins(row.blocks.find((block) => block.key === "wins")?.value, row.date));
    const profile = profileById.get(authorId);
    const story = buildGrowthStory({
      userId: authorId,
      name: profile.display_name ?? null,
      username: profile.username ?? null,
      level: profile.level ?? null,
      humanityVerified: (humanityById.get(authorId) ?? 0) >= 2
    }, days, wins, today);
    if (story) stories.push(story);
  }
  return rankGrowthStories(stories);
}

async function selectChunked(db: any, table: string, fields: string, column: string, ids: string[], refine?: (query: any) => any): Promise<any[]> {
  const result: any[] = [];
  for (let index = 0; index < ids.length; index += CHUNK) {
    let query = db.from(table).select(fields).in(column, ids.slice(index, index + CHUNK));
    if (refine) query = refine(query);
    const { data, error } = await query;
    if (error) return result;
    result.push(...(data ?? []));
  }
  return result;
}

function serviceClient(): any | null {
  try {
    return createServiceSupabaseClient();
  } catch {
    return null;
  }
}
