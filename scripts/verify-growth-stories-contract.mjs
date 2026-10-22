import assert from "node:assert/strict";
import { buildGrowthStory, rankGrowthStories, readStoryWins, STORY_MIN_ACTIVE_DAYS } from "../lib/growthStories.ts";

const today = "2026-10-22";
const author = (userId, humanityVerified = false) => ({ userId, name: userId, username: null, level: 5, humanityVerified });
const day = (date, level, turnover = null, levelBefore = null) => ({
  postId: date, date, postType: "daily_progress", body: null, cover: null,
  level, levelBefore, turnover, spent: null, wins: null, coreGrowth: null
});

// Too few days in the window: no story.
assert.equal(buildGrowthStory(author("a"), [day("2026-10-20", 3), day("2026-10-21", 3)], [], today), null);
assert.equal(STORY_MIN_ACTIVE_DAYS, 3);

// Days older than 30 days are ignored.
const days = [day("2026-09-01", 1, 100), day("2026-10-10", 2, 5, 1), day("2026-10-15", 3, 10), day("2026-10-21", 4, 2.5)];
const wins = [
  readStoryWins({ challenges: [{ id: "c1" }, { id: "c2" }], wishes: [{ id: "w1", title: "Научиться плавать" }] }, "2026-10-15"),
  readStoryWins({ challenges: [], wishes: [{ id: "w2", title: null }] }, "2026-10-21"),
  readStoryWins({ challenges: [{ id: "old" }], wishes: [{ id: "w0", title: "old" }] }, "2026-09-01")
];
const story = buildGrowthStory(author("a", true), days, wins, today);
assert.equal(story.activeDays, 3);
assert.equal(story.levelStart, 1);
assert.equal(story.levelNow, 4);
assert.equal(story.turnover, 17.5);
assert.equal(story.hasTurnover, true);
assert.equal(story.challenges, 2);
assert.deepEqual(story.changes, []);
// A private wish counts, its title stays hidden.
assert.equal(story.wishesCount, 2);
assert.deepEqual(story.wishes, ["Научиться плавать"]);

// Hidden turnover stays "not shown", not zero.
const hidden = buildGrowthStory(author("b"), [day("2026-10-19", 2), day("2026-10-20", 2), day("2026-10-21", 2)], [], today);
assert.equal(hidden.hasTurnover, false);

// Localized titles and malformed blocks.
assert.deepEqual(readStoryWins({ wishes: [{ title: { ru: "Дом", en: "House" } }] }, today).wishes, ["Дом"]);
assert.deepEqual(readStoryWins(null, today), { date: today, challenges: 0, wishes: [] });

// Ranking: fulfilled wishes first, then level growth.
const ranked = rankGrowthStories([hidden, story]);
assert.equal(ranked[0].userId, "a");

console.log("growth stories contract ok");

const { normalizeCompletionStory, withCompletionStory, completionStoryFromBody, WISH_COMPLETION_STORY_MAX } = await import("../lib/growthStories.ts");
assert.equal(normalizeCompletionStory("   "), null);
assert.equal(normalizeCompletionStory(42), null);
assert.equal(normalizeCompletionStory("a\r\n\r\n\r\n\r\nb"), "a\n\nb");
assert.equal(normalizeCompletionStory("x".repeat(WISH_COMPLETION_STORY_MAX + 50)).length, WISH_COMPLETION_STORY_MAX);
const postBody = withCompletionStory("Исполнил желание «Плавать».", "Раньше боялся воды, теперь плаваю 1 км.");
assert.equal(completionStoryFromBody(postBody), "Раньше боялся воды, теперь плаваю 1 км.");
assert.equal(withCompletionStory("Fulfilled.", null), "Fulfilled.");
assert.equal(completionStoryFromBody("Fulfilled."), null);
console.log("completion story contract ok");
