import assert from "node:assert/strict";
import { achievementLogic, achievementStates, parseAchievementLogic } from "../lib/achievements.ts";

assert.deepEqual(parseAchievementLogic("achievement:comments:5"), { series: "comments", threshold: 5 });
assert.equal(parseAchievementLogic("achievement:comments:7"), null); // not a milestone
assert.equal(parseAchievementLogic("first_comment_posted"), null);
assert.equal(achievementLogic("posts", 10), "achievement:posts:10");

const row = (series, threshold, core = 0.1, wallet = 0.01) => ({ id: `${series}-${threshold}`, verification_logic: achievementLogic(series, threshold), core_reward_amount: core, wallet_reward_amount: wallet });
const rows = [row("comments", 10), row("comments", 5), row("posts", 5, 0.5, 0.05), row("reactions_given", 1, 0.01, 0)];
const counts = { comments: 12, posts: 4, reactions_given: 1, reactions_received: 0 };
const states = achievementStates(rows, counts, new Map([["comments-5", "2026-10-28T10:00:00Z"]]));

// Sorted by series then threshold; claimed / ready / locked from the counts.
assert.deepEqual(states.map((item) => [item.challengeId, item.status]), [
  ["comments-5", "claimed"],
  ["comments-10", "ready"],
  ["posts-5", "locked"],
  ["reactions_given-1", "ready"]
]);
assert.deepEqual(states[2].reward, { core: 0.5, wallet: 0.05 });

console.log("achievements contract ok");
