import assert from "node:assert/strict";
const { cleanInviterPath, inviterDays, inviterPathFacts, inviterPathWish } = await import("../lib/inviterPath.ts");

assert.equal(inviterDays("2026-11-14T10:00:00Z", Date.parse("2026-11-25T09:00:00Z")), 11);
assert.equal(inviterDays("2026-11-25T08:00:00Z", Date.parse("2026-11-25T09:00:00Z")), 1);
assert.equal(inviterDays(null), 0);

const path = cleanInviterPath({ days: 12, level: 4, quests: 9, wish: "  Путешествие   в горы " });
assert.deepEqual(path, { days: 12, level: 4, quests: 9, wish: "Путешествие в горы" });
assert.equal(inviterPathFacts(path, "ru"), "день 12 · уровень 4 · заданий: 9");
assert.equal(inviterPathWish(path, "ru"), "идёт к «Путешествие в горы»");
assert.equal(inviterPathFacts(path, "de"), "day 12 · level 4 · quests: 9");

const fresh = cleanInviterPath({ days: 1, level: 0, quests: 0, wish: "" });
assert.equal(inviterPathFacts(fresh, "ru"), "день 1");
assert.equal(inviterPathWish(fresh, "ru"), "");
assert.equal(cleanInviterPath(null), null);
assert.equal(cleanInviterPath({ days: -3, level: "x" }).days, 0);
console.log("inviter path contract ok");
