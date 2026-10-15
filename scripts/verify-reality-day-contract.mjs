import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSocialSource } from "./lib/splitSources.mjs";
import {
  isRealityBlockKey,
  parseRealityDaySummary,
  REALITY_BLOCK_KEYS,
  realityDayHasActivity,
  realityWinsCount,
  utcDateKey
} from "../lib/realityDay.ts";

// Summary parsing tolerates missing and string numbers from Postgres jsonb.
const summary = parseRealityDaySummary({
  date: "2026-10-13",
  turnover: { total: "12.5", sales: 10, people: 0, rewards: 0, deposits: 0, core: "2.5", other: 0, uniquePayers: 1 },
  spent: { total: 3, purchases: 3 },
  wins: { challenges: [{ id: "c1", title: { ru: "Шаг", en: "Step" } }, { title: "no id" }], wishes: [{ id: "w1", title: null }] }
}, "2026-10-13");
assert.equal(summary.turnover.total, 12.5);
assert.equal(summary.turnover.core, 2.5);
assert.equal(summary.spent.people, 0, "missing fields become zero");
assert.equal(summary.wins.challenges.length, 1, "wins without id are dropped");
assert.equal(realityWinsCount(summary), 2);
assert.equal(realityDayHasActivity(summary), true);

const empty = parseRealityDaySummary(null, "2026-10-13");
assert.equal(empty.date, "2026-10-13");
assert.equal(realityDayHasActivity(empty), false);

assert.deepEqual([...REALITY_BLOCK_KEYS], ["level", "turnover", "spent", "wins", "total_core_growth", "team_strength"]);
assert.equal(isRealityBlockKey("turnover"), true);
assert.equal(isRealityBlockKey("participation_balance"), false);
assert.equal(utcDateKey(new Date("2026-10-13T23:59:00Z")), "2026-10-13");

// SQL: turnover excludes returns of own money and counts gross amounts; the function is service-only.
const sql = readFileSync("supabase/migrations/20261013120000_reality_day_summary.sql", "utf8");
assert.match(sql, /operation_type not in \('marketplace_refund', 'p2p_escrow_refund', 'p2p_collateral_release', 'p2p_compensation'\)/);
assert.match(sql, /metadata ->> 'gross_amount'/);
assert.match(sql, /operation_type <> 'p2p_collateral_hold'/);
assert.match(sql, /when w\.visibility = 'public' then w\.title else null/, "private wish titles stay private");
for (const key of REALITY_BLOCK_KEYS) assert.match(sql, new RegExp(`'${key}'`), `block key ${key} is allowed by the constraint`);
assert.match(sql, /revoke all on function public\.reality_day_summary\(uuid, date\) from public, anon, authenticated;/);
assert.match(sql, /grant execute on function public\.reality_day_summary\(uuid, date\) to service_role;/);

// One snapshot and one post per user and day; author's block visibility survives refreshes.
const server = readFileSync("lib/serverRealityDay.ts", "utf8");
assert.match(server, /onConflict: "user_id,source_type,source_date"/);
assert.match(server, /\.eq\("snapshot_id", snapshotId\)/);
assert.match(server, /visibility: visibilityByKey\.get\(block\.block_key\) \?\? block\.visibility/);

// The feed only auto-creates a day post when the day has content; GET never writes.
const route = readFileSync("app/api/social/feed/daily-progress/draft/route.ts", "utf8");
assert.match(route, /body\.ifContent === true && !realityDayHasContent\(context\)/);
const getHandler = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
assert.doesNotMatch(getHandler, /upsert|insert\(|update\(|delete\(/, "GET is read-only");
const social = readSocialSource();
assert.match(social, /JSON\.stringify\(\{ ifContent: true \}\)/);

// Home card publishes through the existing post route and keeps hidden blocks private.
const card = readFileSync("components/RealityDayCard.tsx", "utf8");
assert.match(card, /action: "publish"/);
assert.match(card, /visibility: hidden\.has\(block\.block_key\) \? "private" : "public"/);
const home = readFileSync("components/HomeTodayApp.tsx", "utf8");
assert.match(home, /<RealityDayCard active=\{active\} \/>/);

// Day posts accept the author's photo or video while still a draft.
const media = readFileSync("app/api/social/feed/posts/[postId]/media/route.ts", "utf8");
assert.match(media, /\["manual", "daily_progress", "level_up"\]\.includes\(data\.post_type\) && data\.status === "draft"/);

console.log("reality day contract ok");
