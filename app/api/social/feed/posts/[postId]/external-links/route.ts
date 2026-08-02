import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { TablesInsert } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MAX_URL_LENGTH = 2000;

export async function POST(request: NextRequest, { params }: { params: { postId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const { data: post, error: postError } = await supabase
      .from("feed_posts")
      .select("id,author_user_id,status,visibility,deleted_at")
      .eq("id", params.postId)
      .eq("author_user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (postError) throw postError;
    if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404, headers: NO_STORE_HEADERS });
    if (post.status !== "published" || post.visibility !== "public") {
      return NextResponse.json({ error: "Only published public posts can be mirrored." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const body = await readJsonBody(request);
    const rawUrl = typeof body.url === "string" ? body.url.trim().slice(0, MAX_URL_LENGTH) : "";
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return NextResponse.json({ error: "Enter a valid http or https URL." }, { status: 400, headers: NO_STORE_HEADERS });

    const { data: existing, error: existingError } = await supabase
      .from("feed_post_external_links")
      .select("*")
      .eq("post_id", post.id)
      .eq("external_url", normalized.externalUrl)
      .eq("relation", "mirror")
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json({ link: existing }, { headers: NO_STORE_HEADERS });

    const link: TablesInsert<"feed_post_external_links"> = {
      post_id: post.id,
      provider: normalized.provider,
      external_url: normalized.externalUrl,
      external_post_id: null,
      author_handle: null,
      title: normalized.title,
      caption: "External mirror saved manually by the author.",
      thumbnail_url: null,
      embed_status: "link_only",
      relation: "mirror"
    };
    const { data: inserted, error: insertError } = await supabase
      .from("feed_post_external_links")
      .insert(link)
      .select("*")
      .single();
    if (insertError) throw insertError;
    return NextResponse.json({ link: inserted }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to save external mirror." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeUrl(value: string): { externalUrl: string; provider: string; title: string } | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    const provider = hostname.includes("tiktok") ? "tiktok"
      : hostname.includes("instagram") ? "instagram"
        : hostname.includes("t.me") || hostname.includes("telegram") ? "telegram"
          : hostname.includes("youtube") || hostname === "youtu.be" ? "youtube"
            : hostname === "x.com" || hostname.includes("twitter") ? "x"
              : "website";
    return { externalUrl: url.toString(), provider, title: `External mirror: ${hostname}` };
  } catch {
    return null;
  }
}
