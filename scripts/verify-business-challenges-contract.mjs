import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { distinctOthers, invitedBuyers, strangerBuyers } from "../lib/businessChallenges.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// A seller never counts as their own buyer; repeated buyers count once.
assert.deepEqual(distinctOthers(["a", "b", "a", null, undefined, "", "me"], "me"), ["a", "b"]);
assert.deepEqual(distinctOthers([], "me"), []);

// Strangers are buyers without an invitation link to the seller (either way); invited buyers are the opposite.
assert.deepEqual(strangerBuyers(["a", "b", "c"], ["b"]), ["a", "c"]);
assert.deepEqual(invitedBuyers(["a", "b", "c"], ["b", "x"]), ["b"]);

// The migration: new steps are auto checks with Core +1, no prerequisites, only inserts and updates.
const sql = read("supabase/migrations/20261021140000_business_track.sql");
const logics = [...sql.matchAll(/'auto', '([a-z_0-9]+)',\s*(\d+), 'business', (\d+), null, '[a-z.]+', (\d+), 0, true/g)];
assert.deepEqual(logics.map((row) => row[1]), ["business_second_buyer", "business_reviews_3", "business_stranger_buyer", "business_external_buyer", "first_internal_purchase"]);
assert.ok(logics.every((row) => row[4] === "1"), "each new step is worth Core +1");
assert.equal(new Set(logics.map((row) => row[3])).size, logics.length, "track steps are unique");
assert.ok(!/delete\s+from|drop\s+table|truncate/i.test(sql), "the migration only inserts and updates");

// The server reads the facts for every new check.
const route = read("app/api/challenges/check/route.ts");
for (const logic of ["business_second_buyer", "business_reviews_3", "business_stranger_buyer", "business_external_buyer", "first_internal_purchase"]) {
  assert.ok(route.includes(`"${logic}"`), `${logic} is verified by the route`);
}
for (const table of ["marketplace_deals", "marketplace_reviews", "referral_edges", "humanity_verifications"]) assert.ok(route.includes(`"${table}"`));

console.log("business challenges contract ok");
