import assert from "node:assert/strict";
import { nextQuest, questOfDay, similarQuestForPost } from "../lib/feedQuests.ts";

const quest = (id, logic, extra = {}) => ({ id, title: { ru: id }, core_reward_amount: 1, difficulty_level: 1, verification_logic: logic, path_order: null, ...extra });
const challenges = [
  quest("wish", "has_wish", { path_order: 2 }),
  quest("first", "first_step_motive", { path_order: 1, user_challenge_status: "completed" }),
  quest("audit", "attention_value_audit"),
  quest("help", "trust_event_confirmed:help_given", { difficulty_level: 2 }),
  quest("own", "first_sale", { difficulty_level: 2 }),
  quest("tomorrow", "day_2_return")
];
const data = { challenges, viewerLevel: 1, activeId: null };

// A mapped story leads to its quest.
assert.deepEqual(similarQuestForPost({ source_key: "editorial_story:front-row", post_type: "manual" }, data), { quest: challenges[2], similar: true });
// A quest above the person's level is not offered: the next path step instead (the done one is skipped).
assert.deepEqual(similarQuestForPost({ source_key: "editorial_story:neighbour-and-phone", post_type: "manual" }, data), { quest: challenges[0], similar: false });
// A verified quest post leads to that same quest when it is open to the viewer.
assert.equal(similarQuestForPost({ source_key: null, post_type: "challenge", verifiedChallenge: { challenge_id: "own" } }, { ...data, viewerLevel: 2 })?.quest.id, "own");
// A quest the Quests tab does not show yet is not offered either.
const hiddenAudit = { ...data, challenges: challenges.map((item) => item.id === "audit" ? { ...item, quest_placement: "hidden" } : item) };
assert.deepEqual(similarQuestForPost({ source_key: "editorial_story:front-row", post_type: "manual" }, hiddenAudit), { quest: challenges[0], similar: false });
// The active quest wins over the path order.
assert.equal(nextQuest({ ...data, activeId: "audit" })?.id, "audit");
// "Come back tomorrow" is never offered from the feed.
assert.equal(questOfDay({ challenges: [challenges[5]], viewerLevel: 1, activeId: null }, "2026-10-28"), null);
// After the path, the quest of the day is stable within a day.
const afterPath = { challenges: challenges.filter((item) => item.path_order == null), viewerLevel: 2, activeId: null };
assert.equal(questOfDay(afterPath, "2026-10-28")?.id, questOfDay(afterPath, "2026-10-28")?.id);
assert.ok(questOfDay(afterPath, "2026-10-28"));

console.log("feed quests contract ok");
