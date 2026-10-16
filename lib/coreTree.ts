// Pure maths of the Core tree (no imports, tested directly by node).
// The tree only pictures the Core level: from a sprout at level 0 to an apple tree with fruit at
// level 20. It reads the balance and the level; it changes no balance and no rate.

export const TREE_FULL_LEVEL = 20;

export type CoreTreeStage = "sprout" | "shoot" | "sapling" | "young" | "crown" | "blossom" | "fruit" | "appleTree";

/** Level from which each stage starts, in order. */
export const TREE_STAGES: ReadonlyArray<readonly [number, CoreTreeStage]> = [
  [0, "sprout"],
  [2, "shoot"],
  [4, "sapling"],
  [7, "young"],
  [10, "crown"],
  [13, "blossom"],
  [16, "fruit"],
  [20, "appleTree"]
];

export type CoreTreeShape = {
  /** Level plus the progress towards the next one (for example 7.4). */
  growth: number;
  stage: CoreTreeStage;
  /** Level at which the next stage starts, or null on the last stage. */
  nextStageLevel: number | null;
  nextStage: CoreTreeStage | null;
  trunkHeight: number;
  trunkWidth: number;
  branches: number;
  crownRadius: number;
  /** Leaves on the bare stem before there is a crown. */
  stemLeaves: number;
  /** Leaf clusters of the crown. */
  leaves: number;
  blossoms: number;
  fruits: number;
  fruitRadius: number;
  /** Apples lying on the ground under a grown tree. */
  groundFruits: number;
  roots: number;
  /** 0..1: how grand the tree is past level 14 (aura, size beyond the frame). */
  grandeur: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Two decimals: enough for the drawing, and the server and the browser render identical numbers. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function finite(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Level plus progress inside it. Level thresholds double, so the level started at about half of
 * the next threshold; the fraction never reaches 1, because at 1 the level itself rises.
 */
export function coreTreeGrowth(input: { level: number; balance: number; nextThreshold?: number | null }): number {
  const level = Math.max(0, Math.floor(finite(input.level)));
  const balance = Math.max(0, finite(input.balance));
  const next = finite(input.nextThreshold);
  if (next <= 0) return level;
  const start = level >= 1 ? next / 2 : 0;
  const fraction = clamp((balance - start) / (next - start), 0, 0.999);
  return level + fraction;
}

export function coreTreeStage(growth: number): CoreTreeStage {
  let stage: CoreTreeStage = "sprout";
  for (const [from, name] of TREE_STAGES) if (growth >= from) stage = name;
  return stage;
}

/** Shape of the tree; every size changes smoothly with growth, so a top-up never makes it jump. */
export function coreTreeShape(growth: number): CoreTreeShape {
  const g = Math.max(0, finite(growth));
  const t = clamp(g / TREE_FULL_LEVEL, 0, 1);
  const stage = coreTreeStage(g);
  const nextEntry = TREE_STAGES.find(([from]) => from > g) ?? null;
  const ease = 1 - Math.pow(1 - t, 1.6);
  const canopy = clamp((g - 3) / (TREE_FULL_LEVEL - 3), 0, 1);
  const beyond = Math.max(0, g - TREE_FULL_LEVEL);
  // From level 14 the tree keeps growing past the frame: by level 28 the crown is wider than the card.
  const grandeur = clamp((g - 14) / 14, 0, 1);

  return {
    growth: g,
    stage,
    nextStageLevel: nextEntry ? nextEntry[0] : null,
    nextStage: nextEntry ? nextEntry[1] : null,
    trunkHeight: round(16 + 84 * ease + 34 * grandeur),
    trunkWidth: round(1.6 + 8.4 * t + 8 * grandeur),
    branches: g < 4 ? 0 : Math.min(8, 1 + Math.floor((g - 4) / 2)),
    crownRadius: round(58 * Math.sqrt(canopy) + 44 * grandeur),
    stemLeaves: g >= 4 ? 0 : g < 1 ? 2 : g < 2 ? 3 : 4,
    leaves: g < 3 ? 0 : Math.min(46, 5 + Math.floor((g - 3) * 2.6)) + Math.floor(grandeur * 30),
    blossoms: g < 12 || g >= 18 ? 0 : g < 16 ? Math.min(14, 2 + Math.floor((g - 12) * 4)) : Math.max(0, 14 - Math.floor((g - 16) * 7)),
    fruits: g < 16 ? 0 : g < TREE_FULL_LEVEL ? Math.min(20, 1 + Math.floor((g - 16) * 5)) : Math.min(52, 21 + Math.floor(beyond * 4)),
    fruitRadius: round(4.2 + 2 * grandeur),
    groundFruits: g < 18 ? 0 : Math.min(7, 1 + Math.floor((g - 18) * 1.2)),
    roots: g < 8 ? 0 : Math.min(5, 1 + Math.floor((g - 8) / 3)),
    grandeur: round(grandeur)
  };
}

/** Evenly spread points inside a circle (sunflower spiral), the same every time for the same count. */
export function spiralPoints(count: number, radius: number, turn = 0): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const distance = radius * Math.sqrt((index + 0.5) / Math.max(1, count));
    const angle = index * 2.39996323 + turn;
    points.push({ x: round(distance * Math.cos(angle)), y: round(distance * Math.sin(angle)) });
  }
  return points;
}
