import { NextRequest, NextResponse } from "next/server";
import { authorizeClaudeOrOperator } from "@/lib/claudeActionsAuth";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const KEY = /^[a-z0-9_]{1,64}$/;
const SOURCE_KEY = /^[a-z0-9_:-]{3,120}$/;
const LOCAL_URL = /^\/[a-z0-9/_.-]{1,200}$/i;

type Payload = {
  account?: { key?: unknown; displayName?: unknown; bioRu?: unknown; bioEn?: unknown; avatarUrl?: unknown };
  story?: {
    sourceKey?: unknown;
    seriesKey?: unknown;
    seriesOrder?: unknown;
    titleRu?: unknown;
    bodyRu?: unknown;
    bodyEn?: unknown;
    coverUrl?: unknown;
    coverAltRu?: unknown;
    coverAltEn?: unknown;
    publish?: unknown;
  };
};

/**
 * POST /api/internal/feed/system-story — creates or updates a feed system account (an AI narrator such as the mentor
 * Alina Agitova, docs/mentors/ALINA_AGITOVA.md) and one of its abundance_story posts, matched by sourceKey so a repeat
 * call edits instead of duplicating. Images must be files from /public. Callers: operator or Claude (CLAUDE_ACTIONS_TOKEN),
 * only for texts the operator approved in the project.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeClaudeOrOperator(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const payload = await request.json().catch(() => null) as Payload | null;
  const account = payload?.account;
  const story = payload?.story;

  const accountKey = text(account?.key, 64);
  const displayName = text(account?.displayName, 80);
  const avatarUrl = text(account?.avatarUrl, 200);
  if (!KEY.test(accountKey) || !displayName || (avatarUrl && !LOCAL_URL.test(avatarUrl))) {
    return json({ error: "account.key (a-z0-9_), account.displayName and a local account.avatarUrl are required." }, 400);
  }
  const sourceKey = text(story?.sourceKey, 120);
  const seriesKey = text(story?.seriesKey, 64);
  const seriesOrder = Number(story?.seriesOrder);
  const bodyRu = text(story?.bodyRu, 12000);
  const bodyEn = text(story?.bodyEn, 12000);
  const coverUrl = text(story?.coverUrl, 200);
  if (!SOURCE_KEY.test(sourceKey) || !KEY.test(seriesKey) || !Number.isInteger(seriesOrder) || seriesOrder < 1 || bodyRu.length < 20) {
    return json({ error: "story.sourceKey, story.seriesKey, story.seriesOrder >= 1 and story.bodyRu are required." }, 400);
  }
  if (coverUrl && !LOCAL_URL.test(coverUrl)) return json({ error: "story.coverUrl must be a local /public path." }, 400);
  const publish = story?.publish !== false;
  const now = new Date().toISOString();
  const db = createServiceSupabaseClient() as any;

  const { error: accountError } = await db.from("feed_system_accounts").upsert({
    account_key: accountKey,
    display_name: displayName,
    bio: { ru: text(account?.bioRu, 400), en: text(account?.bioEn, 400) },
    avatar_url: avatarUrl || null,
    is_active: true
  }, { onConflict: "account_key" });
  if (accountError) return json({ error: accountError.message }, 500);

  const { data: existing, error: findError } = await db.from("feed_posts").select("id,published_at").eq("source_key", sourceKey).maybeSingle();
  if (findError) return json({ error: findError.message }, 500);
  const postRow = {
    source_key: sourceKey,
    author_user_id: null,
    author_label: displayName,
    post_type: "abundance_story",
    status: publish ? "published" : "draft",
    visibility: "public",
    title: text(story?.titleRu, 160) || null,
    body: bodyRu,
    deleted_at: null,
    published_at: publish ? existing?.published_at ?? now : null,
    updated_at: now
  };
  const saved = existing
    ? await db.from("feed_posts").update(postRow).eq("id", existing.id).select("id").single()
    : await db.from("feed_posts").insert(postRow).select("id").single();
  if (saved.error) return json({ error: saved.error.message }, 500);
  const postId = saved.data.id as string;

  const translations = [{ post_id: postId, locale: "ru", author_name: displayName, body: bodyRu }];
  if (bodyEn) translations.push({ post_id: postId, locale: "en", author_name: displayName, body: bodyEn });
  const { error: translationError } = await db.from("feed_post_translations").upsert(translations, { onConflict: "post_id,locale" });
  if (translationError) return json({ error: translationError.message }, 500);

  if (coverUrl) {
    const { error: mediaError } = await db.from("feed_post_media").upsert({
      post_id: postId,
      media_type: "image",
      media_url: coverUrl,
      alt_text: { ru: text(story?.coverAltRu, 300), en: text(story?.coverAltEn, 300) },
      sort_order: 0,
      metadata: { layout: "portrait", aspect_ratio: "4:5" }
    }, { onConflict: "post_id,sort_order" });
    if (mediaError) return json({ error: mediaError.message }, 500);
  }

  const { error: metadataError } = await db.from("feed_system_story_metadata").upsert({
    post_id: postId,
    system_account_key: accountKey,
    series_key: seriesKey,
    series_order: seriesOrder,
    story_kind: "mixed",
    evidence_status: "editorial"
  }, { onConflict: "post_id" });
  if (metadataError) return json({ error: metadataError.message }, 500);

  return json({ ok: true, postId, created: !existing, status: postRow.status }, 200);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
