import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const TEMPLATE_URLS: Record<string, string> = {
  daily_progress: "/feed/system-events/daily-progress.png",
  level_up: "/feed/system-events/level-up.png",
  wish_completed: "/feed/system-events/wish-completed.png",
  challenge_completed: "/feed/system-events/challenge-completed.png"
};
const SYSTEM_POST_TYPES = new Set(["daily_progress", "level_up", "wish_completed", "challenge"]);
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export async function PATCH(request: NextRequest, { params }: { params: { postId: string } }) {
  const body = await readJsonBody(request);
  const templateKey = typeof body.templateKey === "string" ? body.templateKey : "";
  const templateUrl = TEMPLATE_URLS[templateKey];
  if (!templateUrl) return NextResponse.json({ error: "Unknown cover template." }, { status: 400, headers: NO_STORE_HEADERS });
  return updateCover(request, params.postId, { media_url: templateUrl, storage_path: null, templateKey });
}

export async function POST(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const post = await getDraftSystemPost(supabase, params.postId, user.id);
    if (!post) return NextResponse.json({ error: "System draft not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400, headers: NO_STORE_HEADERS });
    if (!MIME_EXTENSIONS[file.type] || file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image up to 8 MB." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const previous = await getCover(supabase, post.id);
    const path = `${user.id}/${post.id}/${crypto.randomUUID()}.${MIME_EXTENSIONS[file.type]}`;
    const { error: uploadError } = await supabase.storage.from("feed-media").upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false
    });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const media = await saveCover(supabase, post.id, { media_url: null, storage_path: path, templateKey: "user_upload" });
    if (previous?.storage_path) await supabase.storage.from("feed-media").remove([previous.storage_path]);
    const { data: signed } = await supabase.storage.from("feed-media").createSignedUrl(path, 60 * 60);
    return NextResponse.json({ media: { ...media, media_url: signed?.signedUrl ?? null } }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to upload cover." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

async function updateCover(request: NextRequest, postId: string, cover: { media_url: string | null; storage_path: string | null; templateKey: string }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    const post = await getDraftSystemPost(supabase, postId, user.id);
    if (!post) return NextResponse.json({ error: "System draft not found." }, { status: 404, headers: NO_STORE_HEADERS });
    const previous = await getCover(supabase, post.id);
    const media = await saveCover(supabase, post.id, cover);
    if (previous?.storage_path) await supabase.storage.from("feed-media").remove([previous.storage_path]);
    return NextResponse.json({ media }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to update cover." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

async function getDraftSystemPost(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"], postId: string, userId: string) {
  const { data, error } = await supabase
    .from("feed_posts")
    .select("id,author_user_id,post_type,status")
    .eq("id", postId)
    .eq("author_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data && data.status === "draft" && SYSTEM_POST_TYPES.has(data.post_type) ? data : null;
}

async function getCover(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"], postId: string) {
  const { data, error } = await supabase
    .from("feed_post_media")
    .select("*")
    .eq("post_id", postId)
    .eq("sort_order", 0)
    .maybeSingle();
  if (error) throw error;
  return data as Tables<"feed_post_media"> | null;
}

async function saveCover(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  postId: string,
  cover: { media_url: string | null; storage_path: string | null; templateKey: string }
) {
  const payload = {
    post_id: postId,
    media_type: "image",
    media_url: cover.media_url,
    storage_path: cover.storage_path,
    alt_text: {},
    sort_order: 0,
    metadata: { origin: cover.templateKey === "user_upload" ? "user_upload" : "system_template", templateKey: cover.templateKey }
  } satisfies TablesInsert<"feed_post_media">;
  const { data, error } = await supabase
    .from("feed_post_media")
    .upsert(payload, { onConflict: "post_id,sort_order" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
