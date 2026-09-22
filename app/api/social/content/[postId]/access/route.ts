import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getRequiredSharedContentViewer, isSharedContentId } from "@/lib/sharedContentAccess";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    if (!isSharedContentId(params.postId)) return json({ error: "Content not found." }, 404);
    const viewer = await getRequiredSharedContentViewer(request);
    if (viewer.authError || !viewer.userId) return json({ error: "Sign in to manage access." }, 401);
    const { data: post, error: postError } = await viewer.supabase.from("feed_posts")
      .select("id,author_user_id,post_type").eq("id", params.postId).is("deleted_at", null).maybeSingle();
    if (postError) return json({ error: "Could not manage content access." }, 500);
    if (!post || post.author_user_id !== viewer.userId || post.post_type !== "external_link") return json({ error: "Content not found." }, 404);
    const { data: grants, error: grantsError } = await viewer.supabase.from("feed_post_access")
      .select("recipient_user_id,created_at").eq("post_id", post.id).is("revoked_at", null).order("created_at", { ascending: false });
    if (grantsError) return json({ error: "Could not load access list." }, 500);
    const ids = (grants ?? []).map((grant) => grant.recipient_user_id);
    const { data: profiles, error: profilesError } = ids.length
      ? await viewer.supabase.from("user_profiles").select("user_id,username,display_name").in("user_id", ids).is("deleted_at", null)
      : { data: [], error: null };
    if (profilesError) return json({ error: "Could not load access list." }, 500);
    const byId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    return NextResponse.json({ recipients: ids.map((userId) => byId.get(userId)).filter(Boolean) }, { headers: NO_STORE_HEADERS });
  } catch {
    return json({ error: "Could not load access list." }, 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    if (!isSharedContentId(params.postId)) return json({ error: "Content not found." }, 404);
    const viewer = await getRequiredSharedContentViewer(request);
    if (viewer.authError || !viewer.userId) return json({ error: "Sign in to manage access." }, 401);
    const body = await request.json().catch(() => null) as { recipientUserId?: unknown } | null;
    if (!isSharedContentId(body?.recipientUserId)) return json({ error: "Invalid recipient." }, 400);

    const { data: post, error: postError } = await viewer.supabase
      .from("feed_posts")
      .select("id,author_user_id,post_type")
      .eq("id", params.postId)
      .is("deleted_at", null)
      .maybeSingle();
    if (postError) return json({ error: "Could not manage content access." }, 500);
    if (!post || post.post_type !== "external_link") return json({ error: "Content not found." }, 404);
    if (post.author_user_id !== viewer.userId) return json({ error: "Only the owner can revoke access." }, 403);

    const { data: grant, error: updateError } = await viewer.supabase
      .from("feed_post_access")
      .update({ revoked_at: new Date().toISOString() })
      .eq("post_id", post.id)
      .eq("recipient_user_id", body.recipientUserId)
      .select("recipient_user_id")
      .maybeSingle();
    if (updateError) return json({ error: "Could not revoke content access." }, 500);
    if (!grant) return json({ error: "Access grant not found." }, 404);
    return NextResponse.json({ revoked: true }, { headers: NO_STORE_HEADERS });
  } catch {
    return json({ error: "Could not revoke content access." }, 500);
  }
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
