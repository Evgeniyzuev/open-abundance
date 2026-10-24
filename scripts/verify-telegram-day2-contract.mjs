import assert from "node:assert/strict";
import { DAY2_DEEP_LINK, planDay2 } from "../lib/telegramDay2.ts";
import { readFileSync } from "node:fs";

const NOW = Date.parse("2026-10-24T10:00:00Z");
const H = 3_600_000;
const person = (userId, hoursAgo, timezone = null) => ({ userId, telegramId: 1, registeredAt: new Date(NOW - hoursAgo * H).toISOString(), timezone, locale: "ru", name: "Аня" });
const always = () => true;

const planned = planDay2(
  [person("new", 10), person("day2", 30), person("late", 80), person("sent", 30), person("off", 30), person("today", 30)],
  new Set(["sent"]), new Set(["off"]), new Set(["today"]), always, NOW
);
assert.deepEqual(planned.map((p) => p.userId), ["day2"], "24-72h, once, reminders on, no other message today");
assert.equal(planDay2([person("night", 30)], new Set(), new Set(), new Set(), () => false, NOW).length, 0);
assert.equal(DAY2_DEEP_LINK, "/?view=challenges");

// Variant A (founder decision 2026-10-24): the "tasks for today" text, up to $10, button to the challenges.
const sender = readFileSync(new URL("../lib/coordinatorNudges.ts", import.meta.url), "utf8");
assert.ok(sender.includes("fillNudgeCopy(NEXT_STEPS.tasks.copy"), "day-2 uses the tasks-for-today copy");
assert.ok(sender.includes("Nobody is told \"0 tasks\""), "no message without open tasks");
console.log("telegram day2 contract ok");
