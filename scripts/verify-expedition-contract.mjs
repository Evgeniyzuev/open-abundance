import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20260923130000_oa_expedition_milestones.sql");
const expeditionRoute = read("app/api/expedition/route.ts");
const progressRoute = read("app/api/challenges/progress/route.ts");

assert.match(migration, /unique \(user_challenge_id, milestone_id\)/, "milestone awards must be idempotent per user challenge");
assert.match(migration, /idempotency_key text not null unique/, "milestone awards need a second idempotency guard");
assert.match(migration, /update public\.core_accounts\s+set balance = balance \+ milestone_row\.core_reward_amount/s, "Core must be awarded in the server settlement function");
assert.match(migration, /insert into public\.user_artifacts/, "optional expedition artifacts must be server-issued");
assert.match(migration, /transferable, source_type, source_id/, "artifact issuance must retain private non-transferable metadata");
assert.match(migration, /revoke all on function public\.settle_user_challenge_milestone/, "milestone settlement must not be client-callable");
assert.match(migration, /for update/, "settlement must lock the progress row before awarding");
assert.doesNotMatch(migration, /insert into public\.challenge_milestones/i, "binary challenges must not receive redundant completion milestones");
assert.match(progressRoute, /settle_user_challenge_milestone/, "accepted server proofs must be able to settle matching milestones");
assert.match(expeditionRoute, /\/api\/expedition|export async function GET/, "expedition read model route must exist");
assert.match(expeditionRoute, /wishes|feed_posts|challenges|team_tasks|user_artifacts/, "read model must aggregate the existing product surfaces");
assert.match(expeditionRoute, /getUser\(accessToken\)/, "read model must authenticate the viewer");

console.log("Expedition contract checks passed.");
