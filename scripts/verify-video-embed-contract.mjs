import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findShortVideoLinks, findVideoEmbeds, isShortVideoLink, videoEmbedFromUrl } from "../lib/videoEmbed.ts";
import { normalizeWatchReply, WATCH_MAX_REPLY } from "../lib/watchCompanion.ts";

// Run with: node --experimental-strip-types scripts/verify-video-embed-contract.mjs
const read = (path) => readFileSync(path, "utf8");
const embed = (url) => videoEmbedFromUrl(url);

// --- YouTube: privacy-enhanced official player, shorts are vertical, start time kept ---
assert.equal(embed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s").embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1&rel=0&start=65");
assert.equal(embed("https://youtu.be/dQw4w9WgXcQ?si=abc").shape, "video");
assert.equal(embed("https://m.youtube.com/shorts/dQw4w9WgXcQ").shape, "vertical");
assert.equal(embed("https://www.youtube.com/watch?v=bad"), null, "an invalid id stays a link");
assert.equal(embed("https://www.youtube.com/@channel"), null);

// --- TikTok, Instagram, Telegram, X ---
assert.equal(embed("https://www.tiktok.com/@user/video/7300000000000000000").embedUrl, "https://www.tiktok.com/player/v1/7300000000000000000?rel=0&description=1");
assert.equal(embed("https://vm.tiktok.com/ZMabc123/"), null, "short redirect links stay links");
assert.equal(embed("https://www.instagram.com/reel/C1a2B3c4D5e/").embedUrl, "https://www.instagram.com/reel/C1a2B3c4D5e/embed/");
assert.equal(embed("https://www.instagram.com/someone/"), null);
assert.equal(embed("https://t.me/durov/123").embedUrl, "https://t.me/durov/123?embed=1&mode=tme");
assert.equal(embed("https://t.me/s/durov/123").embedUrl, "https://t.me/durov/123?embed=1&mode=tme");
assert.equal(embed("https://t.me/c/123456/789"), null, "private channels cannot be embedded");
assert.equal(embed("https://t.me/durov"), null);
assert.equal(embed("https://x.com/user/status/1800000000000000000").embedUrl, "https://platform.twitter.com/embed/Tweet.html?id=1800000000000000000&dnt=true");

// --- TikTok short share links are resolved by the server, only through TikTok's own redirects ---
assert.equal(isShortVideoLink("https://vt.tiktok.com/ZSg44HSSC/"), true);
assert.equal(isShortVideoLink("https://vm.tiktok.com/ZMabc123/"), true);
assert.equal(isShortVideoLink("https://www.tiktok.com/t/ZTabc123/"), true);
assert.equal(isShortVideoLink("https://example.com/ZSg44HSSC/"), false);
assert.deepEqual(findShortVideoLinks("см https://vt.tiktok.com/ZSg44HSSC/ и https://youtu.be/dQw4w9WgXcQ"), ["https://vt.tiktok.com/ZSg44HSSC/"]);
assert.equal(embed("https://www.tiktok.com/embed/v2/7300000000000000000").provider, "tiktok");
assert.equal(embed("https://m.tiktok.com/v/7300000000000000000.html").provider, "tiktok");
const resolver = read("app/api/video/resolve/route.ts");
assert.match(resolver, /redirect: "manual"/, "redirects are followed by hand");
assert.match(resolver, /isTikTokHost\(url\.hostname\)/, "only TikTok hosts are fetched");

// --- Vimeo, Rutube, VK ---
assert.equal(embed("https://vimeo.com/76979871").embedUrl, "https://player.vimeo.com/video/76979871?autoplay=1&dnt=1");
assert.equal(embed("https://rutube.ru/video/0123456789abcdef0123456789abcdef/").embedUrl, "https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef?autoplay=1");
assert.equal(embed("https://vkvideo.ru/video-12345_67890").embedUrl, "https://vk.com/video_ext.php?oid=-12345&id=67890&autoplay=1");
assert.equal(embed("https://vk.com/clip-1_2").shape, "vertical");

// --- Refusals ---
assert.equal(embed("javascript:alert(1)"), null);
assert.equal(embed("https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ"), null);
assert.equal(embed("https://example.com/watch?v=dQw4w9WgXcQ"), null);
assert.equal(embed("x".repeat(3000)), null);

// --- Free text: order, no repeats, a limit, trailing punctuation dropped ---
const found = findVideoEmbeds("Смотри https://youtu.be/dQw4w9WgXcQ, и ещё https://youtu.be/dQw4w9WgXcQ и https://t.me/durov/1. И https://vimeo.com/1");
assert.deepEqual(found.map((item) => item.provider), ["youtube", "telegram"]);
assert.deepEqual(findVideoEmbeds(null), []);

// --- Nova's reply is one short plain line ---
assert.deepEqual(normalizeWatchReply({ text: "**Ха**, классно!", emoji: "😂", dance: true }), { text: "Ха, классно!", emoji: "😂", dance: true });
assert.equal(normalizeWatchReply({ text: "ok", emoji: "not emoji" }).emoji, null);
assert.ok(normalizeWatchReply({ text: "a".repeat(500) }).text.length <= WATCH_MAX_REPLY);
assert.equal(normalizeWatchReply({ text: "" }), null);
assert.equal(normalizeWatchReply("text"), null);

// --- Wiring ---
const feed = read("components/social/FeedParts.tsx");
assert.match(feed, /videoEmbedFromUrl\(externalLink\.external_url\)/, "feed link posts use the player");
assert.match(feed, /findVideoEmbeds\(post\.body, 1\)/, "feed text posts use the player");
assert.match(feed, /hasVisualMedia || hasVideoEmbed ? null/, "an open video post shows the player without the still frame on top");
assert.match(feed, /videoLayout \? null : <div className="post-detail-author-row">/, "an open video post has no header above the player");
assert.match(read("components/NotesApp.tsx"), /<TextVideoEmbeds text=\{body\}/, "notes show players for links");
const player = read("components/VideoEmbed.tsx");
assert.match(player, /href=\{embed\.sourceUrl\}/, "the original link is always offered");
assert.match(player, /SLOW_LOAD_MS/, "a slow player points to the link");
const route = read("app/api/ai/watch/react/route.ts");
assert.match(route, /guardAiTool\(request, "tools\.watch"\)/, "own AI quota bucket");
assert.match(route, /guard\.refund\(\)/);
assert.match(read("lib/ai/toolGuard.ts"), /"tools\.watch"/);
assert.match(read("lib/ai/knowledge.ts"), /"watch\.companion": `/);
const nova = read("components/WatchWithNova.tsx");
assert.match(nova, /WATCH_AI_REPLIES_PER_VIDEO/, "AI replies are limited per video");
assert.match(nova, /WATCH_DAY_SOFT_LIMIT_MINUTES/, "Nova suggests a pause after half an hour");
assert.match(nova, /video\.nova\.enough"/, "there is always an 'enough for today' button");

console.log("video embed contract ok");
