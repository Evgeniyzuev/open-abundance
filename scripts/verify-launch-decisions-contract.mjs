import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Founder decisions of 2026-10-13 that must not silently regress before the cohort.
const chat = readFileSync("components/AiChatApp.tsx", "utf8");
assert.match(chat, /const includeContext = Boolean\(userId\);/, "Nova always receives context for a signed-in person");
assert.doesNotMatch(chat, /continueWithoutContext|contextDialogOpen|oa-ai-context-consent/, "no opt-out dialog or stored opt-out");
assert.match(chat, /level !== null \? `level: \$\{level\}` : ""/, "the level is part of Nova's context");
assert.doesNotMatch(chat.slice(chat.indexOf("function buildAiContext")), /balance|wallet/i, "money amounts are never part of the context");

const provider = readFileSync("components/UserProvider.tsx", "utf8");
assert.doesNotMatch(provider, /levels\.filter\(\(level\) => level > 1\)/, "level 1 is celebrated too");
assert.match(provider, /pendingLevelUps\[0\] && !levelUpsHeld/, "the level-up waits while the registration receipt is open");
const onboarding = readFileSync("components/OnboardingApp.tsx", "utf8");
assert.match(onboarding, /holdLevelUps\(true\)/);
assert.match(onboarding, /holdLevelUps\(false\)/);

const copy = readFileSync("lib/onboardingContent.ts", "utf8");
assert.doesNotMatch(copy, /денежные награды|cash rewards/, "onboarding copy follows the 2026-10-13 wording");
assert.match(copy, /прокачивай свой доход/);
assert.match(copy, /Больше возможностей с каждым уровнем/);

console.log("Launch decisions contract verified.");
