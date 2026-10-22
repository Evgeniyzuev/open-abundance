import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countWithinDays, distinctMonths } from "../lib/growthChallenges.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Top-ups count by distinct calendar month; bad or empty values are ignored.
assert.equal(distinctMonths(["2026-08-03T10:00:00Z", "2026-08-30T10:00:00Z", "2026-09-01T00:00:00Z", null, "nope", undefined]), 2);
assert.equal(distinctMonths([]), 0);
assert.equal(distinctMonths(["2025-10-05T00:00:00Z", "2026-10-05T00:00:00Z"]), 2, "the same month of another year is another month");

// Purchases are counted only inside the window ending now.
const now = Date.parse("2026-10-22T00:00:00Z");
assert.equal(countWithinDays(["2026-10-21T00:00:00Z", "2026-08-01T00:00:00Z", "2026-10-23T00:00:00Z", null, "bad"], 60, now), 1);

// The migration: Core +1 only (Wallet is for Core growth and verified people), no deletes, both steps in the route.
const sql = read("supabase/migrations/20261022120000_growth_track.sql");
const rows = [...sql.matchAll(/'auto', '([a-z_0-9]+)',\s*(\d+), 'growth', (\d+), null, '[a-z.]+', (\d+), 0, true/g)];
assert.deepEqual(rows.map((row) => row[1]), ["growth_core_topup_3months", "growth_spend_shift"]);
assert.ok(rows.every((row) => row[4] === "1"), "each growth step is worth Core +1 and no Wallet");
assert.ok(!/delete\s+from|drop\s+table|truncate/i.test(sql));
const route = read("app/api/challenges/check/route.ts");
for (const logic of ["growth_core_topup_3months", "growth_spend_shift"]) assert.ok(route.includes(`"${logic}"`), `${logic} is verified by the route`);
for (const source of ['"wallet_core_topup"', '"user_spend_intents"', '"system_shop_purchase"', '"marketplace_deals"']) assert.ok(route.includes(source));

console.log("growth challenges contract ok");
