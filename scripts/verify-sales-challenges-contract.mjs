import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { salesThreshold, sumCompletedSales } from "../lib/salesChallenges.ts";
import { challengeBadge, challengeGlyph } from "../lib/challengeArt.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Sales thresholds come from the check name, and only from it.
assert.equal(salesThreshold("sales_total_10"), 10);
assert.equal(salesThreshold("sales_total_1000"), 1000);
assert.equal(salesThreshold("sales_total_0"), null, "a zero threshold is not a challenge");
assert.equal(salesThreshold("first_sale"), null);
assert.equal(salesThreshold("sales_total_10; drop table"), null, "nothing else is parsed");
assert.equal(salesThreshold(null), null);

// Any completed sale counts; bad numbers are ignored; the sum is exact enough for whole dollars.
assert.equal(sumCompletedSales([5, "4.5", 0.5]), 10);
assert.equal(sumCompletedSales([null, undefined, "abc", -3, 7]), 7);
assert.equal(sumCompletedSales([]), 0);

// The migration: six new challenges and the wider publication ladder, with the approved rewards.
const sql = read("supabase/migrations/20261017120000_sales_wish_team_publication_challenges.sql");
const rows = [...sql.matchAll(/'(b7d2e4a1-3c5f-4e8a-9b61-0f2a7c4d8e2\d)',[\s\S]*?'auto', '([a-z_0-9]+)', (\d+), '([a-z.]+)', (\d+), 0, true/g)];
const byLogic = Object.fromEntries(rows.map((row) => [row[2], { id: row[1], sort: Number(row[3]), reward: Number(row[5]) }]));
assert.deepEqual(Object.fromEntries(Object.entries(byLogic).map(([logic, row]) => [logic, row.reward])), {
  first_sale: 1,
  sales_total_10: 1,
  sales_total_100: 2,
  sales_total_1000: 5,
  first_wish_fulfilled: 1,
  first_team_task_done: 1
}, "rewards match what the founder approved");
assert.equal(new Set(rows.map((row) => row[1])).size, rows.length, "ids are unique");
assert.equal(new Set(Object.values(byLogic).map((row) => row.sort)).size, rows.length, "sort orders are unique");
for (const target of [5, 10, 20, 50]) assert.ok(sql.includes(`acquisition_target = ${target}`) || sql.includes(`${target}, source.acquisition_series`) || sql.includes(`source.action_view, source.acquisition_series, ${target}`), `the ladder has ${target}`);
assert.match(sql, /core_reward_amount = 5\s*\nwhere id = '55bb0d7b-ef78-46f8-9c02-c8ba42d01f0[1-5]'|5, 0, true\nfrom public\.challenges source/, "the 50-publication step pays 5");
assert.ok(!/delete\s+from|drop\s+table|truncate/i.test(sql), "the migration only inserts and updates");

// The server checks exist for every new check name and use the facts described to the founder.
const route = read("app/api/challenges/check/route.ts");
for (const logic of ["first_sale", "first_wish_fulfilled", "first_team_task_done"]) assert.ok(route.includes(`"${logic}"`), `the check route handles ${logic}`);
assert.ok(route.includes("salesThreshold(challenge.verification_logic)") && /from\("marketplace_deals"\)[\s\S]*?\.eq\("seller_user_id", userId\)[\s\S]*?\.eq\("status", "completed"\)/.test(route), "sales are the completed deals where the person sells");
assert.ok(/from\("wishes"\)[\s\S]{0,200}\.eq\("status", "completed"\)/.test(route), "a fulfilled wish is a wish with the status completed");
assert.ok(/from\("team_tasks"\)[\s\S]{0,200}\.eq\("member_user_id", userId\)[\s\S]{0,60}\.eq\("status", "completed"\)/.test(route), "a team task counts when the leader completed it");

// Covers: each new check has its own glyph, and the new publication steps get their numbers.
for (const logic of ["first_sale", "sales_total_10", "sales_total_100", "sales_total_1000", "first_wish_fulfilled", "first_team_task_done"]) assert.ok(challengeGlyph(logic, "marketplace"), `${logic} has a glyph`);
for (const [title, expected] of [["Пять внешних публикаций", "5"], ["Десять внешних публикаций", "10"], ["Двадцать внешних публикаций", "20"], ["Пятьдесят внешних публикаций", "50"], ["Продажи на 10 $", "10"], ["Продажи на 1 000 $", "1K"], ["Fifty external publications", "50"], ["Five external publications", "5"], ["Ten external publications", "10"], ["Twenty external publications", "20"]]) assert.equal(challengeBadge(title), expected, title);
assert.ok(read("components/ChallengesApp.tsx").includes('startsWith("sales_total_")'), "the sales steps show their number on the cover");
console.log("Sales, wish and team challenges contract verified.");
