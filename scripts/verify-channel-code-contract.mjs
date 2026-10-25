import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { channelCode, isChannelCodeValid } from "../lib/channelCodesServer.ts";

const NOW = Date.parse("2026-10-25T10:00:00Z");
const DAY = 86_400_000;
const code = channelCode("s", "user-1", "telegram", NOW);
assert.match(code, /^\d{6}$/);
assert.equal(code, channelCode("s", "user-1", "telegram", NOW + 3_600_000), "same code all UTC day");
assert.notEqual(code, channelCode("s", "user-1", "push", NOW), "each channel has its own code");
assert.notEqual(code, channelCode("s", "user-2", "telegram", NOW), "each person has their own code");
assert.ok(isChannelCodeValid("s", "user-1", "telegram", code, NOW + DAY), "yesterday's code still works");
assert.ok(!isChannelCodeValid("s", "user-1", "telegram", code, NOW + 2 * DAY), "older codes do not");
assert.ok(isChannelCodeValid("s", "user-1", "telegram", ` ${code.slice(0, 3)} ${code.slice(3)} `, NOW), "spaces are ignored");
assert.ok(!isChannelCodeValid("s", "user-1", "telegram", "", NOW));

const route = readFileSync(new URL("../app/api/challenges/channel-code/route.ts", import.meta.url), "utf8");
assert.ok(route.includes("p_push: false"), "the push code is not copied to Telegram");
const list = readFileSync(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8");
assert.ok(list.includes("CHANNEL_CODE_EVENT"), "the push code stays out of the in-app list");
const migration = readFileSync(new URL("../supabase/migrations/20261025110000_channel_code_challenges.sql", import.meta.url), "utf8");
for (const logic of ["code_telegram", "code_push", "code_nova"]) assert.ok(migration.includes(`'${logic}'`), logic);
console.log("channel code contract ok");
