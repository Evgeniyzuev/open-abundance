import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { buildRealityDays, type RealityDayRow } from "@/lib/realityTimeline";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MAX_DAYS = 120;

// An author's published reality days for stories, the chart and the calendar.
// Readable without a session; only published public posts and their public blocks are returned.
export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const authorId = normalizeUuid(params.userId);
    if (!authorId) return NextResponse.json({ error: "Invalid user id." }, { status: 400, headers: NO_STORE_HEADERS });
    const supabase = createServiceSupabaseClient();

    const { data: posts, error: postsError } = await supabase
      .from("feed_posts")
      .select("id,post_type,body,snapshot_id,published_at,created_at")
      .eq("author_user_id", authorId)
      .in("post_type", ["daily_progress", "level_up"])
      .eq("status", "published")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_DAYS);
    if (postsError) throw postsError;
    const rows = posts ?? [];
    if (!rows.length) return NextResponse.json({ days: [] }, { headers: NO_STORE_HEADERS });

    const postIds = rows.map((post) => post.id);
    const snapshotIds = rows.map((post) => post.snapshot_id).filter((id): id is string => Boolean(id));
    const [blocksResult, mediaResult, snapshotsResult] = await Promise.all([
      supabase.from("feed_post_stat_blocks").select("post_id,block_key,value").in("post_id", postIds).eq("visibility", "public"),
      supabase.from("feed_post_media").select("post_id,media_type,media_url,storage_path").in("post_id", postIds).eq("sort_order", 0),
      snapshotIds.length
        ? supabase.from("progress_snapshots").select("id,source_date").in("id", snapshotIds)
        : Promise.resolve({ data: [] as Array<{ id: string; source_date: string }>, error: null })
    ]);
    if (blocksResult.error) throw blocksResult.error;
    if (mediaResult.error) throw mediaResult.error;
    if (snapshotsResult.error) throw snapshotsResult.error;

    const signed = new Map<string, string | null>();
    await Promise.all((mediaResult.data ?? []).filter((media) => media.storage_path).map(async (media) => {
      const result = await supabase.storage.from("feed-media").createSignedUrl(media.storage_path!, 60 * 60);
      signed.set(media.post_id, result.data?.signedUrl ?? null);
    }));

    const dateBySnapshot = new Map((snapshotsResult.data ?? []).map((snapshot) => [snapshot.id, snapshot.source_date]));
    const dayRows: RealityDayRow[] = rows.map((post) => {
      const media = (mediaResult.data ?? []).find((item) => item.post_id === post.id) ?? null;
      return {
        postId: post.id,
        postType: post.post_type,
        body: post.body,
        date: (post.snapshot_id && dateBySnapshot.get(post.snapshot_id)) || (post.published_at ?? post.created_at).slice(0, 10),
        cover: media ? { type: media.media_type, url: media.storage_path ? signed.get(post.id) ?? null : media.media_url } : null,
        blocks: (blocksResult.data ?? []).filter((block) => block.post_id === post.id).map((block) => ({ key: block.block_key, value: block.value }))
      };
    });

    return NextResponse.json({ days: buildRealityDays(dayRows) }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load reality." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
