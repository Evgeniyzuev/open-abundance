import assert from "node:assert/strict";
const { buildMomentCard, momentImagePath, momentInviteUrl, momentKind } = await import("../lib/momentShare.ts");

assert.equal(momentKind("chest"), "chest");
assert.equal(momentKind("<script>"), "quest");
const card = buildMomentCard({ kind: "path", title: "  Хочу   в горы ", locale: "ru" });
assert.equal(card.title, "Хочу в горы");
assert.equal(card.eyebrow, "Мой путь начался");
assert.ok(!/посчитано/i.test(JSON.stringify(card)), "a link-made card never claims verification");
assert.equal(buildMomentCard({ kind: "week", title: "", locale: "de" }).title, "My week");
assert.equal(buildMomentCard({ title: "x".repeat(300) }).title.length, 80);
const path = momentImagePath({ kind: "chest", title: "+0,50 $ Core" }, "ru", "story");
assert.ok(path.startsWith("/api/share/moment?") && path.includes("format=story") && path.includes("locale=ru"));
assert.equal(momentInviteUrl("https://open-abundance.vercel.app/i/abc123", "quest"), "https://open-abundance.vercel.app/i/abc123?utm_source=moment&utm_campaign=quest");
assert.equal(momentInviteUrl("not a url", "quest"), "not a url");
console.log("moment share contract ok");
