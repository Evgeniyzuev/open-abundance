// Server read for the public page /alina: Alina's published stories with their covers. Only public
// abundance_story posts of her system account, nothing personal.
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { OA_LEAD_PERSONA } from "@/lib/oaLeadPersona";

export type AlinaStoryCard = { id: string; title: string | null; excerpt: string; cover: string | null };

export async function loadAlinaStories(): Promise<AlinaStoryCard[]> {
  let db: any;
  try {
    db = createServiceSupabaseClient();
  } catch {
    return [];
  }
  const { data: metadata } = await db
    .from("feed_system_story_metadata")
    .select("post_id,series_order")
    .eq("system_account_key", OA_LEAD_PERSONA.systemAccountKey)
    .order("series_order", { ascending: false })
    .limit(60);
  const ids = ((metadata ?? []) as Array<{ post_id: string }>).map((row) => row.post_id);
  if (!ids.length) return [];
  const [{ data: posts }, { data: media }] = await Promise.all([
    db.from("feed_posts").select("id,title,body,published_at").in("id", ids).eq("status", "published").eq("visibility", "public").is("deleted_at", null),
    db.from("feed_post_media").select("post_id,media_url,sort_order").in("post_id", ids).eq("sort_order", 0)
  ]);
  const covers = new Map(((media ?? []) as Array<{ post_id: string; media_url: string | null }>).map((row) => [row.post_id, row.media_url]));
  return ((posts ?? []) as Array<{ id: string; title: string | null; body: string | null; published_at: string | null }>)
    .sort((left, right) => String(right.published_at).localeCompare(String(left.published_at)))
    .map((post) => ({
      id: post.id,
      title: post.title,
      excerpt: (post.body ?? "").split("\n").find((line) => line.trim())?.trim().slice(0, 180) ?? "",
      cover: covers.get(post.id) ?? null
    }));
}
