import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function read(path) {
  return readFileSync(path, "utf8");
}

const presentationSource = read("lib/challengePresentation.ts");
const presentationModule = { exports: {} };
const presentationCode = ts.transpileModule(presentationSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
vm.runInThisContext(`(function(module,exports){${presentationCode}\n})`, {
  filename: "lib/challengePresentation.ts"
})(presentationModule, presentationModule.exports);

const { parseChallengeRewardAmount } = presentationModule.exports;
const eligibilityModule = { exports: {} };
const eligibilityCode = ts.transpileModule(read("lib/challengeEligibility.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
vm.runInThisContext(`(function(module,exports){${eligibilityCode}\n})`, {
  filename: "lib/challengeEligibility.ts"
})(eligibilityModule, eligibilityModule.exports);
const { canAcceptChallenge, getChallengeAccessReasons, hasFirstResult, isChallengeAlmostAvailable } = eligibilityModule.exports;
assert.deepEqual(getChallengeAccessReasons({ difficulty_level: 1, verification_logic: "has_referral", prerequisite_completed: false }, 2), ["first_result"]);
assert.deepEqual(getChallengeAccessReasons({ difficulty_level: 3, prerequisite_completed: false }, 1), ["core_level", "prerequisite"]);
assert.equal(canAcceptChallenge({ difficulty_level: 2 }, 2), true);
assert.equal(hasFirstResult([], [{ status: "completed", challenges: { category: "goals" } }]), true, "Legacy completed challenges count as a first result");
assert.equal(hasFirstResult([], [{ status: "completed", challenges: { category: "onboarding" } }]), false);
const prerequisite = { id: "prior", difficulty_level: 1, user_challenge_status: null };
assert.equal(isChallengeAlmostAvailable({ id: "next", difficulty_level: 1, prerequisite_challenge_id: "prior", prerequisite_completed: false }, 1, [prerequisite]), true);
assert.equal(isChallengeAlmostAvailable({ id: "far", difficulty_level: 3, prerequisite_completed: false }, 1, []), false);
assert.equal(isChallengeAlmostAvailable({ id: "two-levels-away", difficulty_level: 3 }, 1, []), false);
const journeyModule = { exports: {} };
const journeyCode = ts.transpileModule(read("lib/journeyAction.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
vm.runInThisContext(`(function(module,exports){${journeyCode}\n})`)(journeyModule, journeyModule.exports);
const { selectJourneyChallenge } = journeyModule.exports;
const available = { id: "available", title: { en: "Available" }, difficulty_level: 1, sort_order: 1 };
const accepted = { ...available, id: "accepted", sort_order: 9, user_challenge_status: "accepted" };
const choices = Object.freeze([Object.freeze(available), Object.freeze(accepted)]);
assert.equal(selectJourneyChallenge(choices, 1)?.id, "accepted", "Continue accepted work before proposing new work");
assert.equal(selectJourneyChallenge([], 1), null);
assert.equal(selectJourneyChallenge([available], 0), null, "Do not recommend level-locked work");
assert.equal(selectJourneyChallenge([{ ...available, user_challenge_status: "completed" }], 1), null);
assert.equal(selectJourneyChallenge([{ ...available, prerequisite_completed: false }], 1), null, "Server eligibility also covers referral gates without a prerequisite id");
assert.equal(selectJourneyChallenge([{ ...available, prerequisite_challenge_id: "prior" }], 1), null);
assert.equal(selectJourneyChallenge([{ ...available, prerequisite_challenge_id: "prior", prerequisite_completed: true }], 1)?.id, "available");
assert.equal(selectJourneyChallenge([{ ...available, id: "b" }, { ...available, id: "a" }], 1)?.id, "a");
assert.equal(parseChallengeRewardAmount(0, "ru"), 0, "A zero reward must stay zero");
assert.equal(parseChallengeRewardAmount({ ru: "Core +1 000$", en: "Core +1,000$" }, "ru"), 1000);
assert.equal(parseChallengeRewardAmount({ ru: "Core +1 000$", en: "Core +1,000$" }, "en"), 1000);
assert.equal(parseChallengeRewardAmount("Core +1,000,000$", "en"), 1_000_000);
assert.equal(parseChallengeRewardAmount("Core +1,5$", "ru"), 1.5);
assert.equal(parseChallengeRewardAmount({ ru: "Не указана", en: "Not specified" }, "ru"), null);
assert.equal(parseChallengeRewardAmount(null, "en"), null);

const challenges = read("components/ChallengesApp.tsx");
const challengeRoute = read("app/api/challenges/route.ts");
const challengeAcceptRoute = read("app/api/challenges/accept/route.ts");
const challengeCheckRoute = read("app/api/challenges/check/route.ts");
const rewardMigration = read("supabase/migrations/20260912192306_challenge_dual_account_rewards.sql");
const peerRewardMigration = read("supabase/migrations/20260913090000_peer_review_dual_account_rewards.sql");
const cleanupMigration = read("supabase/migrations/20260913100000_challenge_rewards_cleanup.sql");
assert.doesNotMatch(challenges, /amount\s*\|\|\s*1/, "Unknown or zero rewards must not become $1");
assert.match(challenges, /core_reward_amount/);
assert.match(challenges, /wallet_reward_amount/);
assert.doesNotMatch(challenges, /resolveChallengeRewardAmounts|challenge\.reward_label/, "Challenge UI must use numeric reward columns");
assert.match(challengeRoute, /core_reward_amount,wallet_reward_amount/);
assert.doesNotMatch(challengeRoute, /\breward_label\b|\breward_amount\b|\breward_account\b/, "Challenge API must use numeric reward columns only");
assert.match(challengeCheckRoute, /settle_user_challenge_rewards/);
assert.doesNotMatch(challengeCheckRoute, /p_reward_account|p_reward_amount/);
assert.match(rewardMigration, /create or replace function public\.settle_user_challenge_rewards/);
assert.match(rewardMigration, /core_reward_amount numeric/);
assert.match(rewardMigration, /wallet_reward_amount numeric/);
assert.match(peerRewardMigration, /alter table public\.peer_review_answers/);
assert.match(peerRewardMigration, /core_reward_amount numeric/);
assert.match(peerRewardMigration, /wallet_reward_amount numeric/);
assert.match(peerRewardMigration, /create or replace function public\.settle_peer_review_answer/);
assert.match(peerRewardMigration, /create or replace function public\.audit_peer_review_answer/);
assert.doesNotMatch(peerRewardMigration, /review_reward_amount/);
assert.match(cleanupMigration, /drop column if exists reward_label/);
assert.match(cleanupMigration, /drop column if exists reward_account/);
assert.match(cleanupMigration, /drop column if exists reward_amount/);
assert.match(cleanupMigration, /core_reward_amount > 0/);
assert.match(cleanupMigration, /complete_user_challenge/);
assert.match(cleanupMigration, /rebuild_user_economy_metrics/);
assert.match(cleanupMigration, /settle_peer_review_answer/);
assert.match(cleanupMigration, /audit_peer_review_answer/);
assert.match(challenges, /challenge-row-state/, "Challenge rows must expose a visible state");
assert.match(challenges, /prerequisiteRequired/, "Prerequisite failure must have a specific visible reason");
assert.match(challenges, /almostAvailable/, "Challenges must expose the almost-available section");
assert.match(challenges, /aria-expanded={open}/, "Challenge sections must be keyboard-expandable");
assert.doesNotMatch(challenges, /ChallengeArchiveScreen/, "Challenge status lists must stay inline");
assert.match(challengeRoute, /can_accept/, "Challenge API must return server eligibility");
assert.match(challengeRoute, /viewerLevel/, "Challenge API must return the authoritative viewer level");
assert.match(challengeRoute, /progressError \|\| snapshotError \|\| coreError/, "Eligibility data errors must fail closed");
assert.match(challengeAcceptRoute, /difficulty_level/, "Challenge acceptance must enforce Core level");
assert.match(challengeAcceptRoute, /progressError/, "Acceptance must fail closed when eligibility data cannot be read");
assert.match(challengeCheckRoute, /getChallengeAccessReasons/, "Challenge checks must repeat server eligibility");
assert.match(challenges, /onError=\{\(\) => setFailedImageUrl/, "Broken challenge images must fall back intentionally");

const home = read("components/HomeTodayApp.tsx");
assert.equal((home.match(/className="home-action-card"/g) ?? []).length, 1, "Home must render only one generic primary-action card");
assert.match(home, /primaryWish \? \(/, "The selected wish must own the primary Home path");
assert.match(home, /home-secondary-disclosure/, "Today and team details must use compact disclosure");
assert.doesNotMatch(home, /Предложи другое|Suggest another/, "The primary wish action must not be duplicated by another suggestion CTA");

const aiChat = read("components/AiChatApp.tsx");
assert.match(aiChat, /quickActions\.slice\(0, 3\)/, "The empty Nova screen must keep only three starting prompts");
assert.match(aiChat, /setInput\(text\)/, "A selected prompt must fill the editable input");
assert.doesNotMatch(aiChat, /sendMessage\(prompt\.text\)/, "Prompt selection must not send automatically");
assert.match(aiChat, /ref=\{inputRef\}/, "Nova must focus the editable input after a prompt is selected");

const translations = read("lib/i18n.ts");
for (const key of [
  "challenges.rewardUnknown",
  "challenges.prerequisiteRequired",
  "home.action.wishTitle",
  "home.path.chooseAction",
  "journey.today",
  "journey.growth",
  "journey.continueWish",
  "journey.resume",
  "journey.toNextLevel"
]) {
  assert.equal((translations.match(new RegExp(`"${key.replaceAll(".", "\\.")}"`, "g")) ?? []).length, 2, `${key} must exist in both locales`);
}

console.log("Engaging interface: rewards, challenge eligibility, Home continuation, translations and editable Nova prompt contracts passed.");
