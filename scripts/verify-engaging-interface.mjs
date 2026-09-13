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

const { parseChallengeRewardAmount, resolveChallengeRewardAmounts } = presentationModule.exports;
assert.equal(parseChallengeRewardAmount(0, "ru"), 0, "A zero reward must stay zero");
assert.equal(parseChallengeRewardAmount({ ru: "Core +1 000$", en: "Core +1,000$" }, "ru"), 1000);
assert.equal(parseChallengeRewardAmount({ ru: "Core +1 000$", en: "Core +1,000$" }, "en"), 1000);
assert.equal(parseChallengeRewardAmount("Core +1,000,000$", "en"), 1_000_000);
assert.equal(parseChallengeRewardAmount("Core +1,5$", "ru"), 1.5);
assert.equal(parseChallengeRewardAmount({ ru: "Не указана", en: "Not specified" }, "ru"), null);
assert.equal(parseChallengeRewardAmount(null, "en"), null);
assert.deepEqual(resolveChallengeRewardAmounts({ core_reward_amount: 2, wallet_reward_amount: 3, reward_amount: 99 }, "ru"), { core_reward_amount: 2, wallet_reward_amount: 3 });
assert.deepEqual(resolveChallengeRewardAmounts({ reward_amount: 5, reward_account: "wallet" }, "ru"), { core_reward_amount: 0, wallet_reward_amount: 5 });
assert.deepEqual(resolveChallengeRewardAmounts({ reward_amount: null, reward_label: { en: "Core +1$", ru: "Core +1$" } }, "ru"), { core_reward_amount: 1, wallet_reward_amount: 0 });
assert.deepEqual(resolveChallengeRewardAmounts({ reward_amount: 0, reward_label: { en: "Core +1$" } }, "en"), { core_reward_amount: 0, wallet_reward_amount: 0 });
assert.deepEqual(resolveChallengeRewardAmounts({ reward_amount: null, reward_label: null }, "en"), { core_reward_amount: 0, wallet_reward_amount: 0 });

const challenges = read("components/ChallengesApp.tsx");
const challengeRoute = read("app/api/challenges/route.ts");
const challengeCheckRoute = read("app/api/challenges/check/route.ts");
const rewardMigration = read("supabase/migrations/20260912192306_challenge_dual_account_rewards.sql");
const peerRewardMigration = read("supabase/migrations/20260913090000_peer_review_dual_account_rewards.sql");
assert.doesNotMatch(challenges, /amount\s*\|\|\s*1/, "Unknown or zero rewards must not become $1");
assert.match(challenges, /core_reward_amount/);
assert.match(challenges, /wallet_reward_amount/);
assert.match(challenges, /resolveChallengeRewardAmounts/, "Old API payloads must be normalized to numeric reward columns");
assert.match(challengeRoute, /core_reward_amount,wallet_reward_amount/);
assert.match(challengeRoute, /reward_label,reward_amount,reward_account/, "Old frontend bundles must retain a compatible API response");
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
assert.match(challenges, /challenge-row-state/, "Challenge rows must expose a visible state");
assert.match(challenges, /prerequisiteRequired/, "Prerequisite failure must have a specific visible reason");
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
  "home.path.chooseAction"
]) {
  assert.equal((translations.match(new RegExp(`"${key.replaceAll(".", "\\.")}"`, "g")) ?? []).length, 2, `${key} must exist in both locales`);
}

console.log("Engaging interface: reward, challenge-state, Home primary-action and editable Nova prompt contracts passed.");
