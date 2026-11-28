import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

// Stars for the «Путь» map (docs/PATH_EXPERIENCE.md): the person's wishes, posts that caught them (liked), their own
// posts and quick notes. Quests and calls come from their own endpoints. Every list is short: the map shows recent
// things, not an archive.
type Db = { from: (table: string) => any };

const clip = (value: unknown, length = 80) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, length) : "");

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const db = supabase as unknown as Db;

  const [wishes, likes, own, noticed] = await Promise.all([
    db.from("wishes").select("id,title,status,image_url,category,cloned_from_wish_id,original_wish_id,created_at").eq("owner_user_id", user.id).is("deleted_at", null).in("status", ["active", "completed"]).order("created_at", { ascending: false }).limit(24),
    db.from("feed_post_likes").select("post_id,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(24),
    db.from("feed_posts").select("id,title,body,post_type,published_at").eq("author_user_id", user.id).is("deleted_at", null).eq("status", "published").order("published_at", { ascending: false }).limit(16),
    db.from("noticed_entries").select("id,text,action,created_at").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(12)
  ]);

  const likedIds = ((likes.data ?? []) as Array<{ post_id: string }>).map((row) => row.post_id);
  const liked = likedIds.length
    ? await db.from("feed_posts").select("id,title,body,post_type").in("id", likedIds).is("deleted_at", null)
    : { data: [] };
  const likedById = new Map(((liked.data ?? []) as Array<{ id: string; title: string | null; body: string | null; post_type: string }>).map((row) => [row.id, row]));

  return NextResponse.json({
    wishes: ((wishes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      title: clip(row.title),
      done: row.status === "completed",
      image: typeof row.image_url === "string" ? row.image_url : null,
      category: typeof row.category === "string" ? row.category : null,
      fromStory: Boolean(row.cloned_from_wish_id || row.original_wish_id)
    })),
    caught: likedIds.map((id) => likedById.get(id)).filter(Boolean).map((row) => ({ id: row!.id, title: clip(row!.title) || clip(row!.body, 60), kind: row!.post_type })),
    own: ((own.data ?? []) as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), title: clip(row.title) || clip(row.body, 60), kind: String(row.post_type ?? "") })),
    notes: noticed.error ? [] : ((noticed.data ?? []) as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), title: clip(row.text, 60), action: clip(row.action, 120) }))
  }, { headers: NO_STORE_HEADERS });
}
