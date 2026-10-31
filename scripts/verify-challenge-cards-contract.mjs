import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitChallengeInstructions } from "../lib/challengePresentation.ts";
import { CHALLENGE_CHECK_REASON_CODES, classifyChallengeCheckReason } from "../lib/challengeCheckReasons.ts";

// Card template: "Why" from the opening paragraph, numbered steps as a list, the rest as a note.
const lesson = splitChallengeInstructions("Урок: регулярность растит Core.\n1. Пополните Core.\n2. Повторите.\n3. Нажмите «Проверить выполнение».");
assert.equal(lesson.why, "Регулярность растит Core.", "the first letter is capitalized after the label is removed");
assert.deepEqual(lesson.steps, ["Пополните Core.", "Повторите.", "Нажмите «Проверить выполнение»."]);
assert.equal(lesson.note, "");

const english = splitChallengeInstructions("Lesson: small steps add up.\n1) Open Wallet\n2) Top up Core\nTip: any amount works.");
assert.equal(english.why, "Small steps add up.");
assert.deepEqual(english.steps, ["Open Wallet", "Top up Core"]);
assert.equal(english.note, "Tip: any amount works.");

const plain = splitChallengeInstructions("Кошелёк → Ядро → введите целевую сумму → нажмите Рассчитать");
assert.deepEqual(plain, { why: "", steps: [], note: "Кошелёк → Ядро → введите целевую сумму → нажмите Рассчитать" }, "older cards keep their text");

const unlabeled = splitChallengeInstructions("Выберите маленькую сумму: любую.\n1. Пополните Core.");
assert.equal(unlabeled.why, "Выберите маленькую сумму: любую.", "only a one-word label is removed");
assert.deepEqual(splitChallengeInstructions(""), { why: "", steps: [], note: "" });

// Failure reasons: every English reason maps to a code the client can translate.
assert.equal(classifyChallengeCheckReason("Could not check your wishes. Try again."), "check_failed");
assert.equal(classifyChallengeCheckReason("Could not read the acceptance date. Try again."), "check_failed");
assert.equal(classifyChallengeCheckReason("Core is not created yet. Refresh the page or sign in again."), "account_missing");
assert.equal(classifyChallengeCheckReason("Verification is not connected for this challenge yet."), "not_connected");
assert.equal(classifyChallengeCheckReason("This challenge needs manual review before it can be completed."), "awaiting_review");
assert.equal(classifyChallengeCheckReason("Accept the challenge first."), "not_accepted");
assert.equal(classifyChallengeCheckReason("Create a wish first, then check this challenge."), "not_done_yet");

const route = readFileSync("app/api/challenges/check/route.ts", "utf8");
assert.match(route, /reasonCode: (verification\.code \?\? )?classifyChallengeCheckReason\(verification\.reason\)/, "the check route returns a reason code");

// Every language has the card labels, reason texts and the explainer.
const keys = [
  "challenges.why", "challenges.steps", "challenges.acceptance", "challenges.openSection", "challenges.help", "app.common.gotIt",
  ...CHALLENGE_CHECK_REASON_CODES.map((code) => `challenges.reason.${code}`),
  "challenges.explainer.title", "challenges.explainer.withdraw.question", "challenges.explainer.withdraw.answer",
  ...[1, 2, 3].flatMap((n) => [`challenges.explainer.step${n}.title`, `challenges.explainer.step${n}.body`]),
  ...[1, 2, 3, 4].flatMap((n) => [`challenges.explainer.benefit${n}.title`, `challenges.explainer.benefit${n}.body`])
];
for (const locale of ["ru", "en", "es", "zh", "hi", "ar"]) {
  const dictionary = readFileSync(`lib/messages/${locale}.ts`, "utf8");
  for (const key of keys) assert.ok(dictionary.includes(`"${key}":`), `${locale} is missing ${key}`);
}

const screen = readFileSync("components/ChallengesApp.tsx", "utf8");
assert.match(screen, /splitChallengeInstructions\(/, "the card uses the shared instructions template");
assert.match(screen, /challenges\.acceptance/, "requirements are shown as \"What counts\"");
assert.match(screen, /<ChallengesExplainer /, "the explainer is reachable from the challenges screen");
assert.match(screen, /aria-label=\{t\("challenges\.help"\)\}/, "the (?) button has an accessible label");

console.log("challenge cards contract: ok");
