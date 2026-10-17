import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARTIFACTS, computeUnlocked, pickToAnnounce, SILENT_ARTIFACTS } from "../lib/artifacts.ts";
import { hasThreeSteps } from "../lib/wishSteps.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The catalog: eight artifacts, each with a picture that exists, and no check opens two of them.
assert.equal(ARTIFACTS.length, 8);
for (const artifact of ARTIFACTS) readFileSync(new URL(`../public${artifact.image}`, import.meta.url));
const logics = ARTIFACTS.flatMap((artifact) => artifact.logics);
assert.equal(new Set(logics).size, logics.length, "one check opens one artifact");

// Rules: only confirmed facts open artifacts, with the date of the earliest fact.
assert.deepEqual(computeUnlocked({ completed: [], level: 0, wishStepsAt: null }), [], "nothing is open without facts");
const opened = computeUnlocked({
  completed: [
    { logic: "has_wish", at: "2026-10-02T10:00:00Z" },
    { logic: "today_completion_streak_7", at: "2026-10-12T10:00:00Z" },
    { logic: "trust_event_confirmed:help_given", at: "2026-10-09T10:00:00Z" },
    { logic: "team_task_help_completed", at: "2026-10-05T10:00:00Z" }
  ],
  level: 3,
  wishStepsAt: "2026-10-03T09:00:00Z"
});
const byKey = Object.fromEntries(opened.map((item) => [item.key, item.at]));
assert.equal(byKey.first_light, "2026-10-02T10:00:00Z", "the first completed challenge opens First light, dated by the earliest");
assert.equal(byKey.seven_day_rhythm, "2026-10-12T10:00:00Z");
assert.equal(byKey.help_someone, "2026-10-05T10:00:00Z", "two checks open one artifact, the earlier date wins");
assert.equal(byKey.wish_path, "2026-10-03T09:00:00Z", "a wish with three steps opens it");
assert.equal(byKey.level_up, null, "a level has no date");
assert.ok(!("today_done" in byKey) && !("first_story" in byKey) && !("skill_evidence" in byKey), "unconfirmed ones stay closed");
assert.ok(computeUnlocked({ completed: [{ logic: "wish_steps_created", at: "2026-10-04T00:00:00Z" }], level: 0, wishStepsAt: null }).some((item) => item.key === "wish_path"), "the challenge alone also opens it");

// Announcing: a device with no record stays quiet, later only new ones are announced, and levels stay silent.
assert.deepEqual(pickToAnnounce(["first_light", "today_done"], null), { announce: [], nextSeen: ["first_light", "today_done"] }, "old awards are not announced all at once");
assert.deepEqual(pickToAnnounce(["first_light", "today_done"], ["first_light"]).announce, ["today_done"], "only the new one is announced");
assert.deepEqual(pickToAnnounce(["first_light"], ["first_light"]).announce, [], "nothing new, nothing announced");
assert.deepEqual(pickToAnnounce(["level_up", "first_light"], []).announce, ["first_light"], "the level-up window already announces levels");
assert.ok(SILENT_ARTIFACTS.includes("level_up"));
assert.deepEqual(pickToAnnounce([], null), { announce: [], nextSeen: [] }, "a record is created even when nothing is open yet");

// Shared step rule, as the challenge used it.
assert.equal(hasThreeSteps("1. купить\n2. выбрать\n3. оплатить"), true);
assert.equal(hasThreeSteps("шаг 1 найти шаг 2 позвонить шаг 3 купить"), true);
assert.equal(hasThreeSteps("просто мечта"), false);
assert.equal(hasThreeSteps(null), false);

// Version 2: the window shows the reward of the challenge that opened it and a button to the matching screen.
const rewarded = computeUnlocked({ completed: [{ logic: "today_core_target_reached", at: "2026-10-12T10:00:00Z", reward: 3 }, { logic: "trust_event_confirmed:proof_added", at: "2026-10-13T10:00:00Z", reward: 2 }], level: 0, wishStepsAt: null });
assert.equal(rewarded.find((item) => item.key === "today_done").reward, 3, "the reward of the opening challenge is returned");
assert.equal(rewarded.find((item) => item.key === "skill_evidence").reward, 2, "Skill in action opens by an accepted proof");
assert.ok(!computeUnlocked({ completed: [{ logic: "skill_profile_completed", at: "2026-10-12T10:00:00Z" }], level: 0, wishStepsAt: null }).some((item) => item.key === "skill_evidence"), "filling the profile alone no longer opens Skill in action");
for (const artifact of ARTIFACTS) {
  assert.ok(artifact.target.main, `${artifact.key} has a target screen`);
  for (const file of ["lib/messages/en.ts", "lib/messages/ru.ts"]) assert.ok(read(file).includes(`"artifact.${artifact.key}.cta"`), `${artifact.key} has a button label in ${file}`);
}
assert.ok(read("components/AppNavigation.tsx").includes('"oa:open-tab"') && read("components/ArtifactWatcher.tsx").includes('"oa:open-tab"'), "the button and the navigation share the oa:open-tab event");

// Wiring.
assert.ok(read("app/api/challenges/check/route.ts").includes('import { hasThreeSteps } from "@/lib/wishSteps"') && !/function hasThreeSteps/.test(read("app/api/challenges/check/route.ts")), "the challenge uses the shared step rule");
const route = read("app/api/artifacts/route.ts");
assert.ok(route.includes("getAuthenticatedUser") && route.includes("computeUnlocked") && !/\.(insert|update|upsert|delete)\(/.test(route), "the artifacts endpoint reads facts and writes nothing");
assert.ok(read("components/AppNavigation.tsx").includes("<ArtifactWatcher />"), "the watcher is mounted");
assert.ok(read("components/ResultsApp.tsx").includes("<ArtifactPassport />"), "the artifacts sit on the Results screen");
assert.ok(read("components/UserProvider.tsx").includes("/milestones/level-up.webp"), "the level-up window shows the artifact picture");
assert.ok(read("lib/supabaseAuthFetch.ts").includes("open-abundance:artifacts-check"), "a successful challenge check wakes the watcher");
assert.ok(read("lib/artifactsClient.ts").includes("ARTIFACTS_CHECK_EVENT = \"open-abundance:artifacts-check\""), "the event name matches");

// Texts in both languages for the window, the section and all eight artifacts.
const ru = read("lib/messages/ru.ts");
const en = read("lib/messages/en.ts");
const keys = ["artifact.opened", "artifact.passport", "artifact.count", "artifact.proof", "artifact.locked", ...ARTIFACTS.flatMap((a) => ["title", "proof", "hint"].map((part) => `artifact.${a.key}.${part}`))];
for (const key of keys) assert.ok(ru.includes(`"${key}":`) && en.includes(`"${key}":`), `both languages have ${key}`);
console.log("Artifacts contract verified.");
