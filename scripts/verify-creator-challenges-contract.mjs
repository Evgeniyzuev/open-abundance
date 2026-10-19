import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { confirmedReferralsThreshold } from "../lib/creatorChallenges.ts";
import { challengeGlyph } from "../lib/challengeArt.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The target comes from the check name, and only from it.
assert.equal(confirmedReferralsThreshold("referrals_confirmed_1"), 1);
assert.equal(confirmedReferralsThreshold("referrals_confirmed_100"), 100);
assert.equal(confirmedReferralsThreshold("referrals_confirmed_0"), null, "a zero target is not a challenge");
assert.equal(confirmedReferralsThreshold("referral_program"), null);
assert.equal(confirmedReferralsThreshold("referrals_confirmed_10; drop table"), null, "nothing else is parsed");
assert.equal(confirmedReferralsThreshold(null), null);

// The migration: four steps in one track, in order, with the approved rewards, only inserts and updates.
const sql = read("supabase/migrations/20261019200000_creator_referral_milestones.sql");
const rows = [...sql.matchAll(/'(e5b1c7a2-4d36-4f81-9c20-3a8d6e1f7b0\d)',[\s\S]*?'auto', 'referrals_confirmed_(\d+)',\s*(\d+), 'creator', (\d+), (null|'[0-9a-f-]+'), '[a-z.]+', (\d+), 0, true/g)];
assert.equal(rows.length, 4, "four steps");
assert.deepEqual(rows.map((row) => Number(row[2])), [1, 10, 50, 100]);
assert.deepEqual(rows.map((row) => Number(row[6])), [0, 5, 20, 50], "rewards match what the founder approved");
assert.deepEqual(rows.map((row) => Number(row[4])), [1, 2, 3, 4], "steps are in order");
assert.equal(rows[0][5], "null", "the first step has no prerequisite");
for (let index = 1; index < rows.length; index += 1) assert.equal(rows[index][5], `'${rows[index - 1][1]}'`, `step ${index + 1} follows step ${index}`);
assert.equal(new Set(rows.map((row) => row[1])).size, 4, "ids are unique");
assert.ok(!/delete\s+from|drop\s+table|truncate/i.test(sql), "the migration only inserts and updates");

// The server counts invited people who passed the humanity check (level 2), from the facts.
const route = read("app/api/challenges/check/route.ts");
assert.ok(route.includes("confirmedReferralsThreshold(challenge.verification_logic)"), "the check route handles the milestones");
assert.ok(/from\("referral_edges"\)[\s\S]{0,200}\.eq\("referrer_user_id", userId\)/.test(route), "invited people are the person's referral edges");
assert.ok(/from\("humanity_verifications"\)[\s\S]{0,300}\.gte\("humanity_level", 2\)/.test(route), "confirmed means humanity level 2");

// Each step has its own glyph.
for (const target of [1, 10, 50, 100]) assert.ok(challengeGlyph(`referrals_confirmed_${target}`, "social"), `referrals_confirmed_${target} has a glyph`);
console.log("Creator referral milestones contract verified.");
