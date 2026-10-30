import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHEST_DEFAULTS, chestBar, chestOddsSummary, chestState, chestsToGrant, nextUtcDay } from "../lib/dailyChests.ts";

const now = new Date("2026-10-30T10:00:00Z");
const base = { chests: [], completedTasks: 0, earnedToday: 0, now, settings: CHEST_DEFAULTS };

assert.deepEqual(chestsToGrant(base), [], "no chest before the first tasks");
assert.deepEqual(chestsToGrant({ ...base, completedTasks: 2 }).map((g) => g.kind), ["first"], "first chest after 2 tasks");
const first = { id: "a", kind: "first", earnedOn: "2026-10-30", opensOn: "2026-10-30", status: "locked", rewardCoreAmount: null, openedOn: null };
assert.deepEqual(chestsToGrant({ ...base, chests: [first], completedTasks: 5, earnedToday: 7.99 }), [], "no new chest below $8");
const grants = chestsToGrant({ ...base, chests: [first], completedTasks: 5, earnedToday: 8 });
assert.deepEqual(grants, [{ kind: "tomorrow", earnedOn: "2026-10-30", opensOn: "2026-10-31" }], "tomorrow's chest at $8");
assert.equal(nextUtcDay("2026-12-31"), "2027-01-01");

let state = chestState({ ...base, chests: [first], completedTasks: 2, earnedToday: 4.9 });
assert.equal(state.hasKey, false);
assert.equal(state.openable, null, "no key below $5");
state = chestState({ ...base, chests: [first], completedTasks: 2, earnedToday: 5 });
assert.equal(state.openable?.id, "a", "key at $5 opens the chest");
const opened = { ...first, status: "opened", openedOn: "2026-10-30", rewardCoreAmount: 0.3 };
const tomorrow = { id: "b", kind: "tomorrow", earnedOn: "2026-10-30", opensOn: "2026-10-31", status: "locked", rewardCoreAmount: null, openedOn: null };
state = chestState({ ...base, chests: [opened, tomorrow], completedTasks: 6, earnedToday: 9 });
assert.equal(state.openable, null, "one key a day, and tomorrow's chest waits for tomorrow");
assert.equal(state.chest?.id, "b");
assert.ok(state.tomorrowChestEarned);
state = chestState({ ...base, now: new Date("2026-10-31T09:00:00Z"), chests: [opened, tomorrow], completedTasks: 6, earnedToday: 5 });
assert.equal(state.openable?.id, "b", "tomorrow the new key opens it");

const odds = chestOddsSummary(CHEST_DEFAULTS.odds);
assert.equal(odds.odds.reduce((sum, item) => sum + item.percent, 0), 100);
assert.equal(odds.expectedAmount, 0.44);
const bar = chestBar(4, 5, 8);
assert.equal(bar.fill, 0.5);
assert.equal(bar.keyMark, 0.625);
assert.equal(bar.toKey, 1);

const migration = readFileSync(new URL("../supabase/migrations/20261030130000_daily_chests.sql", import.meta.url), "utf8");
assert.ok(migration.includes("daily_chests_one_open_per_day"), "one key a day is enforced in the database");
assert.ok(migration.includes("grant execute on function public.open_daily_chest(uuid, uuid, numeric) to service_role"));
const route = readFileSync(new URL("../app/api/chests/route.ts", import.meta.url), "utf8");
assert.ok(!route.includes("wallet_core_topup"), "top-ups do not count toward the key");
console.log("daily chests contract ok");
