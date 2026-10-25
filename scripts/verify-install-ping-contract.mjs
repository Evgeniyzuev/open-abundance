import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

const migration = read("supabase/migrations/20261010100000_install_ping_challenge.sql");
const edge = read("supabase/functions/send-reflection-reminders/index.ts");
const checkRoute = read("app/api/challenges/check/route.ts");
const startRoute = read("app/api/challenges/install-ping/route.ts");
const ackRoute = read("app/api/challenges/install-ping/ack/route.ts");
const installLib = read("lib/installPing.ts");

// No new background job: pings are ordinary reminder_jobs sent by the existing dispatcher.
assert.doesNotMatch(migration, /cron\.schedule/, "the install check must not add a cron job");
assert.match(migration, /reminder_jobs_kind_check[\s\S]*install_ping/);

// Ownership and the three-minute window are enforced in the database, not in the client.
assert.match(migration, /interval '3 minutes'/);
assert.match(migration, /owner_key = 'user:' \|\| p_user_id::text/);
assert.match(migration, /standalone_subscription_required/);

// Schedule shape: one ping later today, five tomorrow.
assert.match(migration, /'install_ping:' \|\| v_round \|\| ':0'/, "same-day ping at index 0");
assert.match(migration, /for v_index in 1\.\.5 loop/, "five pings on the next day");

// Functions are service-role only.
for (const fn of ["schedule_install_ping_round(uuid, uuid, text, text)", "acknowledge_install_ping(uuid, uuid)", "install_ping_state(uuid)"]) {
  assert.ok(migration.includes(`revoke all on function public.${fn} from public, anon, authenticated`), fn + " must be revoked from clients");
  assert.ok(migration.includes(`grant execute on function public.${fn} to service_role`), fn + " must be granted to service_role");
}

// Reward: 2 Core, level 1, no Wallet reward, one completion path through the normal check.
assert.match(migration, /'install_ping_answered', 32, 'home', 2, 0, true/);
assert.match(migration, /difficulty_level[\s\S]*?'system', 1, 3, 'auto', 'install_ping_answered'/);
assert.match(checkRoute, /install_ping_state/);
assert.match(checkRoute, /install_ping_answered/);

// Routes: authenticated, no-store, standalone required, challenge must be accepted first.
for (const source of [startRoute, ackRoute]) {
  assert.match(source, /getAuthenticatedUser/);
  assert.match(source, /NO_STORE_HEADERS/);
  assert.match(source, /force-dynamic/);
}
assert.match(startRoute, /body\?\.standalone !== true/);
assert.match(startRoute, /status", "accepted"/);
assert.match(startRoute, /registered to another account/);
assert.match(ackRoute, /isUuid/);

// The edge function sends the ping with a short TTL so a late push cannot open a stale window.
assert.match(edge, /install_ping/);
assert.match(edge, /TTL: 180/);

// The first id was taken over by the humanity check, so the challenge came back under a new one.
const questPath = read("supabase/migrations/20261025130000_quest_path.sql");
assert.match(installLib, /0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a03/);
assert.ok(questPath.includes("0a5e7f10-1c2d-4e3f-8a4b-5c6d7e8f9a03"), "challenge id matches the migration");
assert.ok(questPath.includes("'install_ping_answered'"), "the restored row keeps its verification logic");

console.log("install ping contract ok");
