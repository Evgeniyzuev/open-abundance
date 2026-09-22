import { NextRequest, NextResponse } from "next/server";
import type { Tables, TablesInsert } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { normalizeUuid } from "@/lib/uuid";
import { publishWishToFeed } from "@/lib/serverWishFeed";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { SHARE_TO_OA_ENABLED } from "@/lib/shareToOA";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type WishStatus = "active" | "completed" | "archived";
type WishVisibility = "private" | "public" | "team" | "contacts";

type WishPostBody = {
  locale?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  imageUrl?: unknown;
  image_url?: unknown;
  targetAmount?: unknown;
  target_amount?: unknown;
  targetCurrency?: unknown;
  target_currency?: unknown;
  difficultyLevel?: unknown;
  difficulty_level?: unknown;
  visibility?: unknown;
  sourceRecommendedWishId?: unknown;
  source_recommended_wish_id?: unknown;
  publishToFeed?: unknown;
  publish_to_feed?: unknown;
  contentPostId?: unknown;
  wishId?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { searchParams } = new URL(request.url);
    const status = normalizeStatusParam(searchParams.get("status"));
    const includeRecommended = searchParams.get("includeRecommended") !== "false";

    let wishesQuery = supabase
      .from("wishes")
      .select("*")
      .eq("owner_user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (status === "all") {
      wishesQuery = wishesQuery.in("status", ["active", "completed", "archived"]);
    } else {
      wishesQuery = wishesQuery.eq("status", status);
    }

    const [wishesResult, recommendedResult] = await Promise.all([
      wishesQuery,
      includeRecommended
        ? supabase
          .from("recommended_wishes")
          .select("id,title,description,image_url,category,estimated_cost,difficulty_level")
          .order("difficulty_level", { ascending: true })
        : Promise.resolve({ data: [], error: null })
    ]);

    if (wishesResult.error) {
      return NextResponse.json({ error: wishesResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    if (recommendedResult.error) {
      return NextResponse.json({ error: recommendedResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const addedRecommendedWishIds = new Set(
      (wishesResult.data ?? [])
        .map((wish) => wish.source_recommended_wish_id)
        .filter((id): id is string => Boolean(id))
    );

    const recommendedWishes = (recommendedResult.data ?? []).filter((wish) => !addedRecommendedWishIds.has(wish.id));

    const wishIds = (wishesResult.data ?? []).map((wish) => wish.id);
    let attachedContent: Record<string, Array<{
      postId: string;
      title: string | null;
      sourceTitle: string | null;
      description: string | null;
      provider: string;
      sourceUrl: string;
      thumbnailUrl: string | null;
    }>> = {};
    if (SHARE_TO_OA_ENABLED && wishIds.length) {
      const { data: links, error: linksError } = await supabase
        .from("feed_post_wish_links")
        .select("wish_id,post_id")
        .eq("owner_user_id", user.id)
        .in("wish_id", wishIds);
      if (linksError) return NextResponse.json({ error: "Could not load wish materials." }, { status: 500, headers: NO_STORE_HEADERS });
      const postIds = [...new Set((links ?? []).map((link) => link.post_id))];
      if (postIds.length) {
        const [{ data: posts, error: postsError }, { data: sources, error: sourcesError }] = await Promise.all([
          supabase.from("feed_posts").select("id,title,author_user_id,post_type,deleted_at").in("id", postIds),
          supabase.from("feed_post_external_links").select("post_id,provider,title,description,thumbnail_url,external_url").in("post_id", postIds).eq("relation", "source")
        ]);
        if (postsError || sourcesError) return NextResponse.json({ error: "Could not load wish materials." }, { status: 500, headers: NO_STORE_HEADERS });
        const validPosts = new Map((posts ?? []).filter((post) => post.author_user_id === user.id && post.post_type === "external_link" && !post.deleted_at).map((post) => [post.id, post]));
        const sourceByPost = new Map((sources ?? []).map((source) => [source.post_id, source]));
        for (const link of links ?? []) {
          const post = validPosts.get(link.post_id);
          const source = sourceByPost.get(link.post_id);
          if (!post || !source || !source.external_url) continue;
          (attachedContent[link.wish_id] ??= []).push({
            postId: post.id,
            title: post.title,
            sourceTitle: source.title,
            description: source.description,
            provider: source.provider,
            sourceUrl: source.external_url,
            thumbnailUrl: source.thumbnail_url ? `/api/social/content/${post.id}/thumbnail` : null
          });
        }
      }
    }

    return NextResponse.json(
      {
        wishes: wishesResult.data ?? [],
        recommendedWishes,
        attachedContent
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load wishes." },
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

    const body = await readJsonBody(request);
    const contentPostId = normalizeUuid(body.contentPostId);
    const requestedWishId = normalizeUuid(body.wishId);
    if ((body.contentPostId !== undefined && !contentPostId) || (body.wishId !== undefined && !requestedWishId)) {
      return NextResponse.json({ error: "Invalid material or wish id." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const sourceRecommendedWishId = normalizeUuid(body.sourceRecommendedWishId ?? body.source_recommended_wish_id);
    if (sourceRecommendedWishId) {
      const existingWish = await findExistingRecommendedWishCopy(supabase, user.id, sourceRecommendedWishId);
      if (existingWish.error) {
        return NextResponse.json({ error: existingWish.error }, { status: 500, headers: NO_STORE_HEADERS });
      }

      if (existingWish.wish) {
        return NextResponse.json({ wish: existingWish.wish, alreadyAdded: true }, { headers: NO_STORE_HEADERS });
      }
    }

    const template = sourceRecommendedWishId && body.title === undefined
      ? await loadRecommendedWishTemplate(supabase, sourceRecommendedWishId)
      : null;
    if (sourceRecommendedWishId && body.title === undefined && !template) {
      return NextResponse.json({ error: "Recommended wish not found." }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const locale = body.locale === "ru" ? "ru" : "en";
    const title = normalizeRequiredText(body.title ?? localizedText(template?.title, locale), 120);
    if (!title && !requestedWishId) {
      return NextResponse.json({ error: "Wish title is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const row: TablesInsert<"wishes"> = {
      owner_user_id: user.id,
      title: title ?? "",
      description: normalizeText(body.description ?? localizedText(template?.description, locale), 1200) ?? "",
      category: normalizeText(body.category ?? template?.category, 80),
      image_url: normalizeText(body.imageUrl ?? body.image_url ?? template?.image_url, 900),
      target_amount: normalizeAmount(body.targetAmount ?? body.target_amount ?? estimatedCostToAmount(template?.estimated_cost ?? null)),
      target_currency: normalizeCurrency(body.targetCurrency ?? body.target_currency),
      difficulty_level: normalizeDifficulty(body.difficultyLevel ?? body.difficulty_level ?? template?.difficulty_level),
      visibility: normalizeVisibility(body.visibility),
      source_recommended_wish_id: sourceRecommendedWishId
    };

    if (contentPostId) {
      if (!SHARE_TO_OA_ENABLED) return NextResponse.json({ error: "Sharing saved materials is not enabled yet." }, { status: 404, headers: NO_STORE_HEADERS });
      if (requestedWishId) {
        const { data: wish, error: wishError } = await supabase.from("wishes").select("*")
          .eq("id", requestedWishId).eq("owner_user_id", user.id).is("deleted_at", null).maybeSingle();
        if (wishError) return NextResponse.json({ error: wishError.message }, { status: 500, headers: NO_STORE_HEADERS });
        if (!wish) return NextResponse.json({ error: "Wish not found." }, { status: 404, headers: NO_STORE_HEADERS });
        const { error: linkError } = await supabase.rpc("attach_saved_content_wish", {
          p_owner_user_id: user.id, p_post_id: contentPostId, p_wish_id: requestedWishId
        });
        if (linkError) return NextResponse.json({ error: linkError.message.includes("Saved material") ? "Saved material not found." : "Could not attach material to wish." }, { status: 400, headers: NO_STORE_HEADERS });
        await recordProductEvent({ entityId: requestedWishId, entityType: "wish", eventName: "saved_content_attached_to_wish", properties: { created_wish: false }, source: "server", userId: user.id });
        return NextResponse.json({ wish, linked: true }, { headers: NO_STORE_HEADERS });
      }

      const idempotencyKey = normalizeUuid(request.headers.get("Idempotency-Key"));
      if (!idempotencyKey) return NextResponse.json({ error: "A valid Idempotency-Key header is required." }, { status: 400, headers: NO_STORE_HEADERS });

      const { data: wishId, error: wishCreateError } = await supabase.rpc("create_saved_content_wish", {
        p_owner_user_id: user.id,
        p_post_id: contentPostId,
        p_title: row.title ?? "",
        p_description: row.description ?? "",
        p_category: row.category ?? null,
        p_image_url: row.image_url ?? null,
        p_target_amount: row.target_amount ?? null,
        p_target_currency: row.target_currency ?? "USD",
        p_difficulty_level: row.difficulty_level ?? 1,
        p_visibility: row.visibility ?? "private",
        p_client_idempotency_key: idempotencyKey
      });
      if (wishCreateError || !wishId) return NextResponse.json({ error: wishCreateError?.message.includes("Saved material") ? "Saved material not found." : "Could not create linked wish." }, { status: 400, headers: NO_STORE_HEADERS });
      const { data: createdWish, error: createdWishError } = await supabase.from("wishes").select("*").eq("id", wishId).single();
      if (createdWishError) return NextResponse.json({ error: createdWishError.message }, { status: 500, headers: NO_STORE_HEADERS });
      await recordProductEvent({
        entityId: createdWish.id,
        entityType: "wish",
        eventName: "wish_created",
        properties: { has_target: createdWish.target_amount !== null, visibility: createdWish.visibility, has_saved_material: true },
        source: "server",
        userId: user.id
      });
      await recordProductEvent({ entityId: createdWish.id, entityType: "wish", eventName: "saved_content_attached_to_wish", properties: { created_wish: true }, source: "server", userId: user.id });
      return NextResponse.json({ wish: createdWish, linked: true }, { status: 201, headers: NO_STORE_HEADERS });
    }

    const { data, error: insertError } = await supabase
      .from("wishes")
      .insert(row)
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const shouldPublishToFeed = normalizeBoolean(body.publishToFeed ?? body.publish_to_feed);
    const publishResult = shouldPublishToFeed ? await publishWishToFeed(supabase, user.id, data) : null;
    await recordProductEvent({
      entityId: data.id,
      entityType: "wish",
      eventName: "wish_created",
      properties: { has_target: data.target_amount !== null, visibility: data.visibility },
      source: "server",
      userId: user.id
    });

    return NextResponse.json(
      {
        wish: data,
        feedPost: publishResult?.post ?? null,
        notice: publishResult?.notice
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create wish." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function loadRecommendedWishTemplate(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  recommendedWishId: string
) {
  const { data, error } = await supabase
    .from("recommended_wishes")
    .select("id,title,description,image_url,category,estimated_cost,difficulty_level")
    .eq("id", recommendedWishId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function localizedText(value: unknown, locale: "ru" | "en"): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record[locale] === "string") return record[locale];
    if (typeof record.en === "string") return record.en;
  }
  return "";
}

function estimatedCostToAmount(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "").replace(/[^\d.,]/g, "");
  if (!normalized) return null;
  const groupedInteger = /^\d{1,3}(?:[.,]\d{3})+$/.test(normalized);
  const numberText = groupedInteger ? normalized.replace(/[.,]/g, "") : normalized.replace(",", ".");
  const amount = Number(numberText);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function normalizeStatusParam(value: string | null): WishStatus | "all" {
  if (value === "completed" || value === "archived" || value === "all") return value;
  return "active";
}

function normalizeVisibility(value: unknown): WishVisibility {
  if (value === "public" || value === "team" || value === "contacts") return value;
  return "private";
}

function normalizeRequiredText(value: unknown, maxLength: number): string | null {
  const text = normalizeText(value, maxLength);
  return text && text.length > 0 ? text : null;
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100) / 100;
}

function normalizeCurrency(value: unknown): string {
  const text = normalizeText(value, 8);
  return text ? text.toUpperCase() : "USD";
}

function normalizeDifficulty(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.round(numeric));
}

async function readJsonBody(request: NextRequest): Promise<WishPostBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

async function findExistingRecommendedWishCopy(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  userId: string,
  sourceRecommendedWishId: string
): Promise<{ wish: Tables<"wishes"> | null; error?: string }> {
  const { data, error } = await supabase
    .from("wishes")
    .select("*")
    .eq("owner_user_id", userId)
    .eq("source_recommended_wish_id", sourceRecommendedWishId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return { wish: null, error: error.message };
  return { wish: data?.[0] ?? null };
}
