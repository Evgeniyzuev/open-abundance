/* eslint-disable @next/next/no-img-element -- next/og renders plain <img>; next/image does not apply here. */
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { normalizeLocale, translate, type AppLocale, type MessageKey } from "@/lib/i18n";
import { buildCardModel, type CardBlock, type CardModel, type CardText } from "@/lib/realityCardModel";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const SIZES = { post: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } } as const;
const SITE = "https://open-abundance.vercel.app";

const fonts = Promise.all([
  fetch(new URL("../fonts/inter-latin-400-normal.woff", import.meta.url)).then((response) => response.arrayBuffer()),
  fetch(new URL("../fonts/inter-cyrillic-400-normal.woff", import.meta.url)).then((response) => response.arrayBuffer()),
  fetch(new URL("../fonts/inter-latin-800-normal.woff", import.meta.url)).then((response) => response.arrayBuffer()),
  fetch(new URL("../fonts/inter-cyrillic-800-normal.woff", import.meta.url)).then((response) => response.arrayBuffer())
]);

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;
type CardData = { name: string; avatar: string | null; cover: string | null; date: string; dayNumber: number; caption: string | null; blocks: CardBlock[] };

// Image of a published public reality day: 4:5 for posts (?format=post), 9:16 for stories (?format=story).
// One headline (the most interesting fact of the day), up to three non-zero numbers, "Day N" and a follow line.
// Only public blocks are drawn; nothing about a draft or a private post is revealed.
export async function GET(request: Request, { params }: { params: { postId: string } }) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "story" ? "story" : "post";
  const locale = normalizeLocale(url.searchParams.get("locale"));
  const size = SIZES[format];
  const postId = /^[0-9a-f-]{36}$/i.test(params.postId) ? params.postId : null;
  if (!postId) return new Response("Not found", { status: 404 });

  const demo = process.env.NODE_ENV !== "production" ? url.searchParams.get("demo") : null;
  const data = demo ? demoCard(demo) : await loadCard(postId);
  if (!data) return new Response("Not found", { status: 404 });

  const t: Translate = (key, values) => translate(locale, key, values);
  const model = buildCardModel(data.blocks, locale);
  const text = cardText(model, locale, t);
  const story = format === "story";
  const pad = 72;
  const accent = model.kind === "level_up" ? "#ffbd4a" : model.kind === "challenge" || model.kind === "wish" ? "#7ee2a8" : "#9cc9ff";
  const [latin400, cyrillic400, latin800, cyrillic800] = await fonts;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "Inter, InterCyrillic", color: "#fff", background: "linear-gradient(160deg, #082d3f 0%, #2b2f8f 55%, #675dff 100%)" }}>
        {data.cover ? <img src={data.cover} alt="" width={size.width} height={size.height} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 26%, rgba(0,0,0,0.15) 42%, rgba(0,0,0,0.86) 74%, rgba(0,0,0,0.94) 100%)" }} />

        <div style={{ position: "absolute", top: story ? 130 : pad, left: pad, right: pad, display: "flex", alignItems: "center", gap: 26 }}>
          {data.avatar ? <img src={data.avatar} alt="" width={120} height={120} style={{ width: 120, height: 120, borderRadius: 60, objectFit: "cover", border: "4px solid rgba(255,255,255,0.95)" }} /> : null}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 52, fontWeight: 800, lineHeight: 1.05 }}>{data.name}</div>
            {model.level !== null ? (
              <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#1b1300", background: "#ffbd4a", borderRadius: 999, padding: "6px 20px" }}>{t("reality.card.level", { level: model.level })}</div>
            ) : null}
          </div>
        </div>

        <div style={{ position: "absolute", left: pad, right: pad, bottom: story ? 210 : pad, display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", color: accent }}>{text.kicker}</div>
            {model.kind === "level_up" && model.levelBefore !== null && model.level !== null ? (
              // Level change as two numbers and a drawn arrow (the font has no bold arrow glyph).
              <div style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 112, fontWeight: 800, lineHeight: 1 }}>
                <div style={{ display: "flex", opacity: 0.6 }}>{String(model.levelBefore)}</div>
                <svg width="96" height="60" viewBox="0 0 96 60">
                  <path d="M6 30 H84 M60 8 L86 30 L60 52" stroke={accent} strokeWidth="11" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={{ display: "flex" }}>{String(model.level)}</div>
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: text.headline.length > 26 ? 64 : 96, fontWeight: 800, lineHeight: 1.05 }}>{text.headline}</div>
            )}
          </div>
          {data.caption ? <div style={{ display: "flex", fontSize: 36, lineHeight: 1.3, opacity: 0.92 }}>{data.caption}</div> : null}
          {model.tiles.length ? (
            <div style={{ display: "flex", gap: 18 }}>
              {model.tiles.map((tile) => (
                <div key={tile.key} style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, padding: "20px 24px", borderRadius: 26, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.18)" }}>
                  <div style={{ display: "flex", fontSize: 26, opacity: 0.78 }}>{tileLabel(tile.key, t)}</div>
                  <div style={{ display: "flex", fontSize: 48, fontWeight: 800 }}>{tileValue(tile.key, tile.value, locale)}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 26, opacity: 0.7 }}>{`${t("reality.card.dayN", { n: data.dayNumber })} · ${formatDate(data.date, locale)}`}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: latin400, weight: 400, style: "normal" },
        { name: "InterCyrillic", data: cyrillic400, weight: 400, style: "normal" },
        { name: "Inter", data: latin800, weight: 800, style: "normal" },
        { name: "InterCyrillic", data: cyrillic800, weight: 800, style: "normal" }
      ],
      headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" }
    }
  );
}

async function loadCard(postId: string): Promise<CardData | null> {
  const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: post } = await supabase
    .from("feed_posts")
    .select("id,author_user_id,post_type,body,snapshot_id,published_at,created_at")
    .eq("id", postId)
    .in("post_type", ["daily_progress", "level_up"])
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .maybeSingle();
  if (!post?.author_user_id) return null;

  const [profileResult, blocksResult, mediaResult, snapshotResult, dayCountResult] = await Promise.all([
    supabase.from("user_profiles").select("display_name,username,avatar_url").eq("user_id", post.author_user_id).maybeSingle(),
    supabase.from("feed_post_stat_blocks").select("block_key,value").eq("post_id", post.id).eq("visibility", "public"),
    supabase.from("feed_post_media").select("media_type,media_url,storage_path").eq("post_id", post.id).eq("sort_order", 0).maybeSingle(),
    post.snapshot_id ? supabase.from("progress_snapshots").select("source_date").eq("id", post.snapshot_id).maybeSingle() : Promise.resolve({ data: null }),
    // "Day N": this author's published public day posts up to this one.
    supabase.from("feed_posts").select("id", { count: "exact", head: true })
      .eq("author_user_id", post.author_user_id).in("post_type", ["daily_progress", "level_up"])
      .eq("status", "published").eq("visibility", "public").is("deleted_at", null).lte("created_at", post.created_at)
  ]);

  const media = mediaResult.data;
  let cover: string | null = null;
  if (media && media.media_type === "image") {
    if (media.storage_path && !/\.webp$/i.test(media.storage_path)) {
      cover = (await supabase.storage.from("feed-media").createSignedUrl(media.storage_path, 300)).data?.signedUrl ?? null;
    } else if (media.media_url) {
      cover = media.media_url.startsWith("/") ? `${SITE}${media.media_url}` : media.media_url;
    }
  }
  const profile = profileResult.data;
  return {
    name: profile?.display_name || (profile?.username ? `@${profile.username}` : "Open Abundance"),
    avatar: profile?.avatar_url ?? null,
    cover,
    date: snapshotResult.data?.source_date ?? (post.published_at ?? post.created_at).slice(0, 10),
    dayNumber: Math.max(1, dayCountResult.count ?? 1),
    caption: post.body && !/^(My Growth: |Daily Core progress for )/.test(post.body) ? post.body.slice(0, 140) : null,
    blocks: blocksResult.data ?? []
  };
}

function cardText(model: CardModel, locale: AppLocale, t: Translate): CardText {
  if (model.kind === "level_up") return { kicker: t("reality.card.kicker.levelUp"), headline: `${model.levelBefore ?? ""} → ${model.level ?? 0}` };
  if (model.kind === "challenge") return { kicker: t("reality.card.kicker.challenge"), headline: clip(model.challengeTitle ?? "", 60) };
  if (model.kind === "wish") return { kicker: t("reality.card.kicker.wish"), headline: clip(model.wishTitle ?? t("reality.card.kicker.wish"), 60) };
  if (model.kind === "turnover") return { kicker: t("reality.card.kicker.turnover"), headline: `+${money(model.turnover ?? 0, locale)}` };
  if (model.kind === "core") return { kicker: t("reality.card.kicker.core"), headline: `+${money(model.coreGrowth ?? 0, locale)}` };
  return { kicker: t("reality.card.kicker.day"), headline: t("reality.card.level", { level: model.level ?? 0 }) };
}

function tileLabel(key: string, t: Translate): string {
  if (key === "level") return t("social.post.level");
  if (key === "turnover") return t("social.post.turnover");
  if (key === "wins") return t("social.post.wins");
  return t("reality.card.coreTile");
}

function tileValue(key: string, value: number, locale: AppLocale): string {
  return key === "level" || key === "wins" ? String(value) : `+${money(value, locale)}`;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

// Local design review only (never in production): ?demo=level|challenge|turnover|quiet
function demoCard(kind: string): CardData {
  const base = { name: "Евгений", avatar: null, cover: `${SITE}/feed/system-events/daily-progress.png`, date: "2026-10-13", dayNumber: 12, caption: null as string | null };
  if (kind === "level") return { ...base, cover: `${SITE}/feed/system-events/level-up.png`, blocks: [{ block_key: "level", value: { levelBefore: 4, levelAfter: 5 } }, { block_key: "turnover", value: { amount: 0 } }, { block_key: "total_core_growth", value: { amount: 0.021 } }] };
  if (kind === "challenge") return { ...base, caption: "Первое объявление на Market — оказалось проще, чем думал.", cover: `${SITE}/feed/system-events/challenge-completed.png`, blocks: [{ block_key: "level", value: { levelBefore: 5, levelAfter: 5 } }, { block_key: "wins", value: { count: 2, challenges: [{ id: "a", title: { ru: "Первое объявление на Market", en: "First Market listing" } }], wishes: [] } }, { block_key: "turnover", value: { amount: 120 } }] };
  if (kind === "turnover") return { ...base, blocks: [{ block_key: "level", value: { levelBefore: 6, levelAfter: 6 } }, { block_key: "turnover", value: { amount: 1250 } }, { block_key: "wins", value: { count: 0, challenges: [], wishes: [] } }, { block_key: "total_core_growth", value: { amount: 3.4 } }] };
  return { ...base, blocks: [{ block_key: "level", value: { levelBefore: 5, levelAfter: 5 } }, { block_key: "turnover", value: { amount: 0 } }, { block_key: "total_core_growth", value: { amount: 0.021 } }] };
}

function money(value: number, locale: AppLocale): string {
  const digits = Math.abs(value) >= 1 || value === 0 ? 2 : Math.min(6, Math.max(2, 2 - Math.floor(Math.log10(Math.abs(value)))));
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value)} $`;
}

function formatDate(date: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
