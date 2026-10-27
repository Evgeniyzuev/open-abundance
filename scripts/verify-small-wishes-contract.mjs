import assert from "node:assert/strict";
import { coreForLevel, coreIncome, levelForCore, summarizeWishPrice, wishLevelForPrice, wishSizeFor } from "../lib/wishPrice.ts";
import { matchSmallWish, pickSmallWishOffers, SMALL_WISHES } from "../lib/smallWishes.ts";

// Levels mirror level_thresholds.
assert.equal(coreForLevel(1), 2);
assert.equal(coreForLevel(8), 250);
assert.equal(coreForLevel(10), 1000);
assert.equal(coreForLevel(11), 2000);
assert.equal(coreForLevel(20), 1_000_000);
assert.equal(levelForCore(1000), 10);
assert.equal(levelForCore(999), 9);

// Evgen's example: Core $1000 gives about $230 a year and about $20 a month.
assert.ok(Math.abs(coreIncome(1000, 365) - 231) < 1);
assert.ok(Math.abs(coreIncome(1000, 30) - 19) < 1);
assert.equal(wishLevelForPrice(230), 10, "$230 is one year of income at level 10");
assert.equal(wishLevelForPrice(232), 11);
assert.equal(wishLevelForPrice(3000), 14);
assert.equal(wishLevelForPrice(0), 0, "free wishes are open at once");
assert.equal(wishLevelForPrice(null), 0);
assert.equal(wishSizeFor(20, 1000), "significant", "$20 is a little over a month of income at $1000");
assert.equal(wishSizeFor(18, 1000), "medium");
assert.equal(wishSizeFor(4, 1000), "small");
assert.equal(wishSizeFor(500, 1000), "later");
assert.equal(summarizeWishPrice(0, 5).size, "free");

// Catalog: three kinds, money wishes up to $30, unique keys and titles.
assert.equal(new Set(SMALL_WISHES.map((wish) => wish.key)).size, SMALL_WISHES.length);
for (const kind of ["help", "habit", "money"]) assert.ok(SMALL_WISHES.some((wish) => wish.kind === kind), kind);
for (const wish of SMALL_WISHES) {
  assert.ok(wish.kind === "money" ? wish.price > 0 && wish.price <= 30 : wish.price === 0, wish.key);
  assert.equal(matchSmallWish(wish.title.ru)?.key, wish.key);
  assert.equal(matchSmallWish(`  ${wish.title.en.toUpperCase()} `)?.key, wish.key);
}
assert.equal(matchSmallWish("Купить дом"), null);

const offers = pickSmallWishOffers({ coreBalance: 3, categories: ["Health"], ownedKeys: [], seed: "u:2026-10-27" });
assert.deepEqual(offers.map((wish) => wish.kind), ["help", "habit", "money"]);
assert.ok(offers.every((wish) => wish.category === "Health"), "related categories come first");
assert.deepEqual(offers, pickSmallWishOffers({ coreBalance: 3, categories: ["Health"], ownedKeys: [], seed: "u:2026-10-27" }), "stable within a day");
const owned = pickSmallWishOffers({ coreBalance: 3, categories: ["Health"], ownedKeys: offers.map((wish) => wish.key), seed: "u:2026-10-27" });
assert.ok(owned.every((wish) => !offers.some((offer) => offer.key === wish.key)), "owned wishes are not offered again");
console.log("small wishes contract ok");
