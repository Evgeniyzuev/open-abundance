import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coreTreeGrowth, coreTreeShape, coreTreeStage, spiralPoints, TREE_FULL_LEVEL, TREE_STAGES } from "../lib/coreTree.ts";

// Growth is the level plus the progress towards the next one, never a full extra level.
assert.equal(coreTreeGrowth({ level: 0, balance: 0, nextThreshold: 2 }), 0);
assert.ok(Math.abs(coreTreeGrowth({ level: 0, balance: 1, nextThreshold: 2 }) - 0.5) < 1e-9);
assert.ok(Math.abs(coreTreeGrowth({ level: 10, balance: 1500, nextThreshold: 2000 }) - 10.5) < 1e-9, "halfway from 1000 to 2000");
assert.ok(coreTreeGrowth({ level: 10, balance: 1999.99, nextThreshold: 2000 }) < 11, "the next level is reached only by the level itself");
assert.equal(coreTreeGrowth({ level: 30, balance: 1e12, nextThreshold: null }), 30, "the top level has no progress");
assert.equal(coreTreeGrowth({ level: Number.NaN, balance: Number.NaN, nextThreshold: Number.NaN }), 0, "bad numbers give a sprout");

// Stages: a sprout at level 0, blossom in the teens, an apple tree from level 20.
assert.equal(coreTreeStage(0), "sprout");
assert.equal(coreTreeStage(13.2), "blossom");
assert.equal(coreTreeStage(16), "fruit");
assert.equal(coreTreeStage(TREE_FULL_LEVEL), "appleTree");
assert.equal(coreTreeStage(28), "appleTree");
for (let index = 1; index < TREE_STAGES.length; index += 1) assert.ok(TREE_STAGES[index][0] > TREE_STAGES[index - 1][0], "stages are in order");

// Every size grows with Core and never shrinks; small steps make small changes (no jumps).
let previous = coreTreeShape(0);
for (let growth = 0.05; growth <= 26; growth += 0.05) {
  const shape = coreTreeShape(growth);
  assert.ok(shape.trunkHeight >= previous.trunkHeight - 1e-9 && shape.trunkWidth >= previous.trunkWidth - 1e-9 && shape.crownRadius >= previous.crownRadius - 1e-9, `the tree never shrinks at ${growth.toFixed(2)}`);
  assert.ok(shape.trunkHeight - previous.trunkHeight < 2 && shape.crownRadius - previous.crownRadius < 9, `no jump at ${growth.toFixed(2)}`);
  if (growth >= 16) assert.ok(shape.fruits >= previous.fruits, "fruit only add up");
  previous = shape;
}
assert.equal(coreTreeShape(5).fruits, 0, "no fruit before the fruit stage");
assert.equal(coreTreeShape(14).fruits, 0);
assert.ok(coreTreeShape(14).blossoms > 0, "the tree blossoms before it bears fruit");
assert.ok(coreTreeShape(TREE_FULL_LEVEL).fruits >= 20, "the apple tree is covered with fruit");
assert.equal(coreTreeShape(0).crownRadius, 0, "a sprout has no crown");
assert.equal(coreTreeShape(20).nextStage, null);
assert.equal(coreTreeShape(8).nextStage, "crown");
assert.equal(coreTreeShape(8).nextStageLevel, 10);

// Positions are the same every render and stay inside the crown.
assert.deepEqual(spiralPoints(12, 30), spiralPoints(12, 30));
for (const point of spiralPoints(40, 30)) assert.ok(Math.hypot(point.x, point.y) <= 30 + 1e-9);
assert.equal(spiralPoints(0, 30).length, 0);

// The tree only reads balances; it never calls the server or writes data.
const component = readFileSync(new URL("../components/CoreTree.tsx", import.meta.url), "utf8");
assert.ok(!/fetch\(|supabase|apply[A-Z]\w*\(/.test(component), "the tree is read-only");
for (const file of ["../lib/messages/en.ts", "../lib/messages/ru.ts"]) {
  const messages = readFileSync(new URL(file, import.meta.url), "utf8");
  for (const [, stage] of TREE_STAGES) assert.ok(messages.includes(`"coreTree.stage.${stage}"`), `${file} names the ${stage} stage`);
}
console.log("Core tree contract verified.");
