import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCardModel } from "../lib/realityCardModel.ts";

const level = (before, after) => ({ block_key: "level", value: { levelBefore: before, levelAfter: after } });
const turnover = (amount) => ({ block_key: "turnover", value: { amount } });
const core = (amount) => ({ block_key: "total_core_growth", value: { amount } });
const wins = (challenges = [], wishes = []) => ({ block_key: "wins", value: { count: challenges.length + wishes.length, challenges, wishes } });

// The headline is the most interesting fact; numbers never repeat it and zeros are not shown.
let model = buildCardModel([level(4, 5), turnover(0), core(0.021)], "ru");
assert.equal(model.kind, "level_up");
assert.deepEqual(model.tiles, [], "zero turnover and tiny Core growth are not shown");

model = buildCardModel([level(5, 5), turnover(120), wins([{ id: "a", title: { ru: "Первое объявление", en: "First listing" } }, { id: "b", title: "Второй" }])], "en");
assert.equal(model.kind, "challenge");
assert.equal(model.challengeTitle, "First listing");
assert.deepEqual(model.tiles.map((tile) => tile.key), ["level", "turnover", "wins"]);

model = buildCardModel([level(5, 5), wins([], [{ id: "w", title: null }])], "ru");
assert.equal(model.kind, "wish", "a private wish still counts, without its title");
assert.equal(model.wishTitle, null);

model = buildCardModel([level(6, 6), turnover(1250), core(3.4)], "ru");
assert.equal(model.kind, "turnover");
assert.deepEqual(model.tiles.map((tile) => tile.key), ["level", "core"]);

model = buildCardModel([level(2, 2), core(2.5)], "ru");
assert.equal(model.kind, "core");
model = buildCardModel([level(2, 2), core(0.3)], "ru");
assert.equal(model.kind, "day", "small Core growth is not a headline");
assert.deepEqual(model.tiles.map((tile) => tile.key), ["level", "core"]);
model = buildCardModel([], "ru");
assert.equal(model.kind, "day", "hidden blocks are simply absent");
assert.deepEqual(model.tiles, []);

// Rendering: separate Cyrillic family so bold Cyrillic is really bold; demo data never in production.
const route = readFileSync("app/api/reality/card/[postId]/route.tsx", "utf8");
assert.match(route, /fontFamily: "Inter, InterCyrillic"/);
assert.match(route, /name: "InterCyrillic", data: cyrillic800, weight: 800/);
assert.match(route, /process\.env\.NODE_ENV !== "production" \? url\.searchParams\.get\("demo"\) : null/);
assert.match(route, /\.lte\("created_at", post\.created_at\)/, "Day N counts only earlier or same posts");

console.log("reality card contract ok");
