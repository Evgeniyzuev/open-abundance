import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artSeed, challengeBadge, challengeCover, challengeGlyph, CHALLENGE_GLYPHS, isOwnImage, MILESTONE_COVERS } from "../lib/challengeArt.ts";

// Glyphs: one per kind of check, a category fallback, nothing for the unknown.
assert.equal(challengeGlyph("referral_program", "social"), "🤝");
assert.equal(challengeGlyph("acquisition_metric_unknown", "social"), "📣", "any acquisition check is a megaphone");
assert.equal(challengeGlyph("never_seen", "finance"), "💰", "an unknown check falls back to the category glyph");
assert.equal(challengeGlyph(null, null), null, "no glyph at all leaves the old icon in place");
const logics = Object.keys(CHALLENGE_GLYPHS);
assert.ok(new Set(logics.map((key) => CHALLENGE_GLYPHS[key])).size >= logics.length - 6, "glyphs are mostly distinct, so challenges do not look alike");

// The numbered series show their number, in both languages, with Cyrillic word endings handled.
const cases = [
  ["Первая внешняя публикация", "1"],
  ["Три внешние публикации", "3"],
  ["Шесть внешних публикаций", "6"],
  ["Двенадцать внешних публикаций", "12"],
  ["1 000 просмотров", "1K"],
  ["100 реакций", "100"],
  ["10 содержательных комментариев", "10"],
  ["Three external publications", "3"],
  ["First external publication", "1"],
  ["Протестируй Open Abundance", null],
  ["Построй план роста", null],
  ["", null],
  [null, null]
];
for (const [title, expected] of cases) assert.equal(challengeBadge(title), expected, `badge of "${title}"`);

// Milestone art covers only checks that have no picture of their own, and every file exists.
for (const [logic, path] of Object.entries(MILESTONE_COVERS)) {
  assert.equal(challengeCover(logic), path);
  readFileSync(new URL(`../public${path}`, import.meta.url));
}
assert.equal(challengeCover("referral_program"), null);

// Only our own pictures are shown; a hotlink to another site is replaced by the drawn cover.
assert.equal(isOwnImage("/challenges/main-wish-path.jpg"), true);
assert.equal(isOwnImage("https://pub-9f979ee92cb84068b0e472feb3309f5e.r2.dev/feed/x.jpg"), true);
assert.equal(isOwnImage("https://i.pinimg.com/736x/86/7e/2c/867e2cf2156873ec3d7a26c0e0791699.jpg"), false);
assert.equal(isOwnImage("//evil.example/x.png"), false);
assert.equal(isOwnImage(null), false);

// A stable look per challenge, different between neighbours, inside the ranges the CSS expects.
assert.deepEqual(artSeed("abc"), artSeed("abc"));
const seeds = Array.from({ length: 40 }, (_, index) => artSeed(`challenge-${index}`));
for (const seed of seeds) assert.ok(seed.shift >= -30 && seed.shift <= 30 && seed.x >= 18 && seed.x < 63 && seed.y >= 12 && seed.y < 47);
assert.ok(new Set(seeds.map((seed) => seed.shift)).size > 20, "hues differ across challenges");

// Wiring: the card uses the helpers and the thumbnail never loads a foreign image.
const app = readFileSync(new URL("../components/ChallengesApp.tsx", import.meta.url), "utf8");
assert.ok(app.includes("isOwnImage(challenge.image_url)") && app.includes("challengeGlyph("), "the thumbnail uses the art rules");
console.log("Challenge art contract verified.");
