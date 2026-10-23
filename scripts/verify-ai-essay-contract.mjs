import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_ESSAY_CHALLENGE_ID, AI_ESSAY_DISCUSSION_POST_ID, ESSAY_RUBRIC, essayReward, essayTotalScore, normalizeEssayBody, rankComments } from "../lib/aiEssay.ts";

// Rubric weights add up to 100.
assert.equal(ESSAY_RUBRIC.reduce((sum, item) => sum + item.weight, 0), 100);
assert.equal(essayTotalScore({ relevance: 100, depth: 100, personal: 100, novelty: 100, clarity: 100 }), 100);
assert.equal(essayTotalScore({ relevance: 80, depth: 60, personal: 40, novelty: 20, clarity: 100 }), 58);
assert.equal(essayTotalScore({ relevance: 500 }), 25);

// Founder's split: first 80 points to Core, points above 80 to Wallet; under 30 nothing.
assert.deepEqual(essayReward(2, 100), { core: 1.6, wallet: 0.4 });
assert.deepEqual(essayReward(2, 90), { core: 1.6, wallet: 0.2 });
assert.deepEqual(essayReward(2, 80), { core: 1.6, wallet: 0 });
assert.deepEqual(essayReward(2, 55), { core: 1.1, wallet: 0 });
assert.deepEqual(essayReward(2, 29), { core: 0, wallet: 0 });

assert.equal(normalizeEssayBody("коротко"), null);
assert.equal(normalizeEssayBody("а".repeat(4001)), null);
assert.ok(normalizeEssayBody("а".repeat(600)));

assert.deepEqual(rankComments([
  { id: "a", score: 1, created_at: "2026-10-23T10:00:00Z" },
  { id: "b", score: 3, created_at: "2026-10-23T11:00:00Z" },
  { id: "c", score: 1, created_at: "2026-10-23T09:00:00Z" }
]).map((row) => row.id), ["b", "c", "a"]);

// SQL mirrors the same rule and stays idempotent.
const sql = readFileSync(new URL("../supabase/migrations/20261023140000_ai_essay_challenge.sql", import.meta.url), "utf8");
assert.ok(sql.includes(AI_ESSAY_CHALLENGE_ID) && sql.includes(AI_ESSAY_DISCUSSION_POST_ID));
assert.match(sql, /least\(p_score, 80\)/);
assert.match(sql, /greatest\(p_score - 80, 0\)/);
assert.match(sql, /p_score < 30/);
assert.match(sql, /if submission\.status <> 'submitted' then/);
assert.match(sql, /'ai_essay_review'/);
assert.match(sql, /1\.6, 0\.4, true/);
assert.match(sql, /revoke all on public\.challenge_essay_submissions from public, anon, authenticated/);

console.log("ai essay contract ok");
