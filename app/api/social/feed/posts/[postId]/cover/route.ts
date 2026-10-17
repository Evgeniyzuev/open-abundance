import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { buildMediaKey, deleteObject, putObject, readR2Config, validateUploadRequest } from "@/lib/r2Media";
import { recordR2Media } from "@/lib/serverFeedMedia";
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

    // Covers live in Cloudflare R2 only; without its settings nothing is stored (Supabase Storage is not used).
    const config = readR2Config(process.env);
    if (!config) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE_HEADERS });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400, headers: NO_STORE_HEADERS });
    const check = validateUploadRequest({ contentType: file.type, size: file.size });
    if (!check.ok || check.kind !== "image") {
      return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image up to 10 MB." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const key = buildMediaKey(user.id, post.id, check.extension, crypto.randomUUID());
    if (!(await putObject(config, key, await file.arrayBuffer(), file.type))) {
      return NextResponse.json({ error: "Could not store the image. Try again." }, { status: 502, headers: NO_STORE_HEADERS });
    }
    try {
      const media = await recordR2Media(supabase, config, { postId: post.id, userId: user.id, key, contentType: file.type, size: file.size, templateKey: "user_upload" });
      return NextResponse.json({ media }, { headers: NO_STORE_HEADERS });
    } catch (recordError) {
      await deleteObject(config, key);
      return NextResponse.json({ error: recordError instanceof Error ? recordError.message : "Failed to upload cover." }, { status: 500, headers: NO_STORE_HEADERS });
    }
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
