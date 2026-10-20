import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyWheel, GOAL_CARDS, goalCard, LIFE_SPHERE_KEYS, normalizeWheel, orderGoalCards, VALUES_CHALLENGE_SWIPES, valuesChallengeDone } from "../lib/lifeValues.ts";
import { challengeGlyph } from "../lib/challengeArt.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The deck is big enough for the challenge, keys are unique, every card belongs to a sphere.
assert.ok(GOAL_CARDS.length >= VALUES_CHALLENGE_SWIPES, "enough cards for the challenge in one pass");
assert.equal(new Set(GOAL_CARDS.map((card) => card.key)).size, GOAL_CARDS.length, "card keys are unique");
for (const card of GOAL_CARDS) assert.ok(LIFE_SPHERE_KEYS.includes(card.sphere), `${card.key} has a known sphere`);
assert.equal(goalCard("teeth")?.sphere, "health");
assert.equal(goalCard("nope"), null);
assert.equal(goalCard(42), null);

// The wheel: every sphere scored 0–10, at least one criterion.
const wheel = emptyWheel();
assert.equal(normalizeWheel(wheel), null, "no criteria, not saved");
wheel.health.criteria = "  сон и энергия  ";
assert.equal(normalizeWheel(wheel)?.health.criteria, "сон и энергия");
assert.equal(normalizeWheel({ ...wheel, finance: { now: 11, want: 5, criteria: "" } }), null, "scores stop at 10");
assert.equal(normalizeWheel({ ...wheel, finance: { now: 2.5, want: 5, criteria: "" } }), null, "whole numbers only");
const { home, ...missing } = wheel;
assert.equal(normalizeWheel(missing), null, "every sphere is required");
assert.equal(normalizeWheel(null), null);

// Order: the sphere with the biggest gap opens the deck, then one card per sphere in turn; decided cards are skipped.
wheel.home = { now: 1, want: 10, criteria: "" };
const ordered = orderGoalCards(wheel, new Set());
assert.equal(ordered.length, GOAL_CARDS.length);
assert.equal(ordered[0].sphere, "home");
assert.notEqual(ordered[1].sphere, "home", "spheres alternate");
assert.ok(!orderGoalCards(wheel, new Set(["new_home"])).some((card) => card.key === "new_home"));

// Done: the wheel and 30 swipes.
assert.equal(valuesChallengeDone({ wheelSaved: true, swipeCount: VALUES_CHALLENGE_SWIPES }), true);
assert.equal(valuesChallengeDone({ wheelSaved: true, swipeCount: VALUES_CHALLENGE_SWIPES - 1 }), false);
assert.equal(valuesChallengeDone({ wheelSaved: false, swipeCount: 100 }), false);

// The migration and the check route agree; the migration only creates and upserts.
const sql = read("supabase/migrations/20261020150000_values_goals_activity.sql");
assert.ok(sql.includes("'values_goals_defined'"), "the challenge row");
assert.ok(/'auto', 'values_goals_defined',\s*\d+, 'people\.feed', 1, 0, true/.test(sql), "Core +1, like the other learning challenges");
assert.ok(!/delete\s+from|drop\s+table|truncate/i.test(sql), "the migration only creates and upserts");
const route = read("app/api/challenges/check/route.ts");
assert.ok(/verification_logic === "values_goals_defined"[\s\S]{0,300}from\("user_values_profiles"\)/.test(route), "the check reads the activity row");
assert.ok(challengeGlyph("values_goals_defined", "self_discovery"), "the challenge has a glyph");
console.log("Values and goals contract verified.");
