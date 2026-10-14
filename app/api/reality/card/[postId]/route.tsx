/* eslint-disable @next/next/no-img-element -- next/og renders plain <img>; next/image does not apply here. */
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { normalizeLocale, translate, type AppLocale, type MessageKey } from "@/lib/i18n";

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

// Image of a published public reality day: 4:5 for posts (?format=post), 9:16 for stories (?format=story).
// Only public blocks are drawn; nothing about a draft or a private post is revealed.
export async function GET(request: Request, { params }: { params: { postId: string } }) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "story" ? "story" : "post";
  const locale = normalizeLocale(url.searchParams.get("locale"));
  const size = SIZES[format];
  const postId = /^[0-9a-f-]{36}$/i.test(params.postId) ? params.postId : null;
  if (!postId) return new Response("Not found", { status: 404 });

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
  if (!post?.author_user_id) return new Response("Not found", { status: 404 });

  const [profileResult, blocksResult, mediaResult, snapshotResult] = await Promise.all([
    supabase.from("user_profiles").select("display_name,username,avatar_url").eq("user_id", post.author_user_id).maybeSingle(),
    supabase.from("feed_post_stat_blocks").select("block_key,value").eq("post_id", post.id).eq("visibility", "public"),
    supabase.from("feed_post_media").select("media_type,media_url,storage_path").eq("post_id", post.id).eq("sort_order", 0).maybeSingle(),
    post.snapshot_id ? supabase.from("progress_snapshots").select("source_date").eq("id", post.snapshot_id).maybeSingle() : Promise.resolve({ data: null })
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
  const name = profile?.display_name || (profile?.username ? `@${profile.username}` : "Open Abundance");
  const date = snapshotResult.data?.source_date ?? (post.published_at ?? post.created_at).slice(0, 10);
  const caption = post.body && !/^(My Growth: |Daily Core progress for )/.test(post.body) ? post.body.slice(0, 160) : null;
  const t = (key: MessageKey) => translate(locale, key);
  const stats = buildStats(blocksResult.data ?? [], locale, t);
  const [latin400, cyrillic400, latin800, cyrillic800] = await fonts;
  const story = format === "story";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "Inter", color: "#fff", background: "linear-gradient(160deg, #082d3f 0%, #2b2f8f 55%, #675dff 100%)" }}>
        {cover ? <img src={cover} alt="" width={size.width} height={size.height} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.85) 100%)" }} />
        <div style={{ position: "absolute", top: story ? 120 : 64, left: 64, right: 64, display: "flex", alignItems: "center", gap: 24 }}>
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" width={96} height={96} style={{ width: 96, height: 96, borderRadius: 48, objectFit: "cover", border: "4px solid rgba(255,255,255,0.9)" }} /> : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 44, fontWeight: 800 }}>{name}</div>
            <div style={{ fontSize: 30, opacity: 0.85 }}>{formatDate(date, locale)}</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 64, right: 64, bottom: story ? 200 : 72, display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", opacity: 0.8 }}>{t("reality.day.title")}</div>
          {caption ? <div style={{ fontSize: 40, lineHeight: 1.25 }}>{caption}</div> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {stats.map((stat) => (
              <div key={stat.label} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "22px 28px", borderRadius: 28, background: "rgba(255,255,255,0.16)", minWidth: 280 }}>
                <div style={{ fontSize: 28, opacity: 0.8 }}>{stat.label}</div>
                <div style={{ fontSize: 56, fontWeight: 800 }}>{stat.value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 28, opacity: 0.75 }}>open-abundance.vercel.app</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: latin400, weight: 400, style: "normal" },
        { name: "Inter", data: cyrillic400, weight: 400, style: "normal" },
        { name: "Inter", data: latin800, weight: 800, style: "normal" },
        { name: "Inter", data: cyrillic800, weight: 800, style: "normal" }
      ],
      headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" }
    }
  );
}

function buildStats(blocks: Array<{ block_key: string; value: unknown }>, locale: AppLocale, t: (key: MessageKey) => string) {
  const read = (key: string, field: string) => {
    const value = blocks.find((block) => block.block_key === key)?.value;
    if (!value || typeof value !== "object") return null;
    const parsed = Number((value as Record<string, unknown>)[field]);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const stats: Array<{ label: string; value: string }> = [];
  const level = read("level", "levelAfter");
  const levelBefore = read("level", "levelBefore");
  if (level !== null) stats.push({ label: t("social.post.level"), value: levelBefore !== null && levelBefore !== level ? `${levelBefore} → ${level}` : String(level) });
  const turnover = read("turnover", "amount");
  if (turnover !== null) stats.push({ label: t("social.post.turnover"), value: `+${money(turnover, locale)}` });
  const wins = read("wins", "count");
  if (wins !== null && wins > 0) stats.push({ label: t("social.post.wins"), value: String(wins) });
  const growth = read("total_core_growth", "amount");
  if (growth !== null && stats.length < 4) stats.push({ label: t("social.post.totalCoreGrowth"), value: `+${money(growth, locale)}` });
  return stats.slice(0, 4);
}

function money(value: number, locale: AppLocale): string {
  const digits = Math.abs(value) >= 1 || value === 0 ? 2 : Math.min(6, Math.max(2, 2 - Math.floor(Math.log10(Math.abs(value)))));
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value)} $`;
}

function formatDate(date: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
