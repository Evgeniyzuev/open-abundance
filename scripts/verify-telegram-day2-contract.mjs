import assert from "node:assert/strict";
import { DAY2_DEFAULT_LINK, day2Message, planDay2 } from "../lib/telegramDay2.ts";

const NOW = Date.parse("2026-10-24T10:00:00Z");
const H = 3_600_000;
const person = (userId, hoursAgo, timezone = null) => ({ userId, telegramId: 1, registeredAt: new Date(NOW - hoursAgo * H).toISOString(), timezone, locale: "ru" });
const always = () => true;

const planned = planDay2([person("new", 10), person("day2", 30), person("late", 80), person("sent", 30), person("off", 30)], new Set(["sent"]), new Set(["off"]), always, NOW);
assert.deepEqual(planned.map((p) => p.userId), ["day2"]);
assert.equal(planDay2([person("night", 30)], new Set(), new Set(), () => false, NOW).length, 0);

assert.deepEqual(day2Message("ru", DAY2_DEFAULT_LINK), { text: "Проверь сколько можешь заработать сегодня https://t.me/open_abundance_bot/OpenA", buttonText: "Открыть", url: DAY2_DEFAULT_LINK });
assert.equal(day2Message("es", DAY2_DEFAULT_LINK).text, "Check how much you can earn today https://t.me/open_abundance_bot/OpenA");
console.log("telegram day2 contract ok");
