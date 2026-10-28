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

// Live leads: always higher in level, the follower may choose once a day.
const { readFileSync } = await import("node:fs");
const migration = readFileSync(new URL("../supabase/migrations/20261027180000_live_leads_higher_level_member_choice.sql", import.meta.url), "utf8");
assert.ok(migration.includes("leader.level > greatest(member.level, 0)"), "a lead is strictly higher");
assert.ok(migration.includes("'member_choice'"), "member choice is recorded");
assert.ok(migration.includes("interval '1 day'"), "one choice a day");
assert.ok(migration.includes("detach_team_member_to_system"), "no higher lead -> Open Abundance lead");
console.log("live leads contract ok");

// Daily wish proposals: money only after contribution, active people only, a mix of kinds.
const { buildWishCandidates, pickWishProposals } = await import("../lib/wishFulfilmentCandidates.ts");
const nowMs = Date.parse("2026-10-28T08:00:00Z");
const act = new Map([["a", nowMs - 3_600_000], ["b", nowMs - 3_600_000], ["c", nowMs - 20 * 86_400_000]]);
const done = (user, n) => Array.from({ length: n }, () => ({ user_id: user, status: "completed" }));
const cands = buildWishCandidates({
  wishes: [
    { id: "w1", owner_user_id: "a", title: "Купить книгу", target_amount: 20, status: "active" },
    { id: "w2", owner_user_id: "b", title: "Купить книгу", target_amount: 20, status: "active" },
    { id: "w3", owner_user_id: "c", title: "Что-то", target_amount: 0, status: "active" },
    { id: "w4", owner_user_id: "b", title: "Своё", target_amount: 0, status: "active", category: "health" }
  ],
  userChallenges: [...done("a", 4), ...done("b", 4)],
  humanity: new Map([["a", 2]]),
  lastActive: act,
  now: nowMs
});
assert.deepEqual(cands.map((row) => row.userId).sort(), ["a", "b"], "inactive c is skipped");
assert.equal(cands.find((row) => row.userId === "a").kind, "money");
assert.equal(cands.find((row) => row.userId === "b").kind, "free", "b has no «Я не робот», so no money wish");
assert.ok(!cands.some((row) => row.label === "Своё"), "private titles never leave");
assert.equal(pickWishProposals(cands, 3).length, 2);
console.log("wish proposals contract ok");
