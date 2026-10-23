// Challenges checked by AI: an essay answer scored 0-100 by the AI reviewer (Claude after the daily analytics run,
// or the operator). Pure, no imports, so the script, the routes and `pnpm test:ai-essay` share it.

export const AI_ESSAY_CHALLENGE_ID = "a1f0e55a-7c2d-4b6e-9f10-3d5c8b2a6e02";
export const AI_ESSAY_DISCUSSION_POST_ID = "a1f0e55a-7c2d-4b6e-9f10-3d5c8b2a6e01";
export const AI_ESSAY_LOGIC = "ai_essay_review";
export const AI_ESSAY_MIN_CHARS = 500;
export const AI_ESSAY_MAX_CHARS = 4000;
/** Below this the answer pays nothing and goes back for rework. */
export const AI_ESSAY_PASS_SCORE = 30;
/** Founder's split (2026-10-23): points up to 80 pay into Core, points above 80 into Wallet. */
export const AI_ESSAY_CORE_CAP = 80;

/** Posts whose comments are ranked by votes (best first) instead of by time. */
export const VOTE_RANKED_POST_IDS = new Set([AI_ESSAY_DISCUSSION_POST_ID]);

export type EssayCriterion = "relevance" | "depth" | "personal" | "novelty" | "clarity";

/** Rubric for the reviewer. The score never depends on which position the person takes. */
export const ESSAY_RUBRIC: Array<{ key: EssayCriterion; weight: number; ru: string; en: string }> = [
  { key: "relevance", weight: 25, ru: "Соответствие вопросам", en: "Answers the questions" },
  { key: "depth", weight: 25, ru: "Подробность и доводы", en: "Detail and reasoning" },
  { key: "personal", weight: 25, ru: "Личный вклад и конкретные шаги", en: "Personal contribution and concrete steps" },
  { key: "novelty", weight: 15, ru: "Новизна идей", en: "Novel ideas" },
  { key: "clarity", weight: 10, ru: "Ясность", en: "Clarity" }
];

export function normalizeEssayBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return body.length >= AI_ESSAY_MIN_CHARS && body.length <= AI_ESSAY_MAX_CHARS ? body : null;
}

/** Weighted total of per-criterion scores (each 0-100). Missing criteria count as 0. */
export function essayTotalScore(scores: Partial<Record<EssayCriterion, number>>): number {
  const total = ESSAY_RUBRIC.reduce((sum, item) => sum + clamp(scores[item.key] ?? 0) * item.weight, 0) / 100;
  return Math.round(total);
}

/** Reward for a score; mirrors review_challenge_essay in SQL. Base = Core + Wallet amounts of the challenge. */
export function essayReward(base: number, score: number): { core: number; wallet: number } {
  if (score < AI_ESSAY_PASS_SCORE) return { core: 0, wallet: 0 };
  const s = clamp(score);
  return {
    core: round2((base * Math.min(s, AI_ESSAY_CORE_CAP)) / 100),
    wallet: round2((base * Math.max(s - AI_ESSAY_CORE_CAP, 0)) / 100)
  };
}

/** Reddit-style ranking: higher score first, ties by time. */
export function rankComments<T extends { score: number; created_at: string }>(comments: T[]): T[] {
  return [...comments].sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at));
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
