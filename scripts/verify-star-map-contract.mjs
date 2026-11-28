import assert from "node:assert/strict";
import * as m from "../lib/starMap.ts";
import { buildTrail } from "../lib/pathTrail.ts";

const q = (id, status, order) => ({ id, title: `Quest ${id}`, status, pathOrder: order, reward: 1, eligible: true });
const items = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, title: `${prefix} ${i}` }));

for (const sizes of [[0, 0, 0, 0], [3, 2, 1, 1], [12, 14, 12, 10]]) {
  const trail = buildTrail({
    quests: [q("a", "completed", 1), q("b", "completed", 2), q("c", "accepted", 3), q("d", null, 4), q("e", null, 5)],
    currentQuestId: "c",
    calls: [{ id: "k", title: "Call", kind: "call", status: "taken", reward: 1 }],
    sealed: [{ id: "s1", reward: 1 }, { id: "s2", reward: 1 }],
    chestOpenable: true
  });
  const map = m.buildStarMap({ goal: { id: "g", title: "Goal" }, trail, wishes: items("w", sizes[0]), caught: items("c", sizes[1]), own: items("o", sizes[2]), notes: items("n", sizes[3]) });
  const ids = new Set(map.stars.map((s) => s.id));
  assert.equal(ids.size, map.stars.length, "unique star ids");
  for (const link of map.links) assert.ok(ids.has(link.a) && ids.has(link.b), `link ends exist ${link.a}-${link.b}`);
  // Every star stands apart from every other.
  for (let i = 0; i < map.stars.length; i += 1) for (let j = i + 1; j < map.stars.length; j += 1) {
    const a = map.stars[i], b = map.stars[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + 6, `apart ${a.id} / ${b.id} (${sizes})`);
  }
  // Constellations around the goal stay off the trail.
  const trailStars = map.stars.filter((s) => s.cluster === "path" || s.kind === "goal");
  for (const s of map.stars.filter((s) => s.cluster && s.cluster !== "path")) for (const t of trailStars) {
    assert.ok(Math.hypot(s.x - t.x, s.y - t.y) >= 50, `off trail ${s.id} / ${t.id} (${sizes})`);
  }
  // Empty places are fog stars that open the place.
  for (const cluster of map.clusters.filter((c) => c.empty && c.id !== "path")) assert.ok(map.stars.some((s) => s.kind === "fog" && s.ref === cluster.id), `fog for ${cluster.id}`);
  assert.equal(map.stars.filter((s) => s.state === "current" && s.kind === "task").length, 1);
  assert.ok(map.stars.some((s) => s.kind === "fog" && s.cluster === "path"), "ahead quests are fog");
}

const map = m.buildStarMap({ goal: { id: null, title: "" }, trail: [], wishes: [], caught: [], own: [], notes: [] });
const cam = m.startCamera(map, 360, 420);
assert.ok(cam.zoom >= m.ZOOM_MIN && cam.zoom <= m.ZOOM_MAX);
// project / unproject round trip at any turn and zoom.
for (const c of [{ x: 10, y: -20, zoom: 1.7, angle: 0.8 }, { x: -100, y: 40, zoom: 0.4, angle: -2.1 }]) {
  const p = { x: 123, y: -45 };
  const back = m.unproject(c, 360, 420, m.project(c, 360, 420, p));
  assert.ok(Math.abs(back.x - p.x) < 1e-6 && Math.abs(back.y - p.y) < 1e-6, "round trip");
  // zoomAt and rotateAt keep the world point under the finger.
  const at = { x: 200, y: 150 };
  const under = m.unproject(c, 360, 420, at);
  for (const next of [m.zoomAt(c, 360, 420, at, 1.6), m.rotateAt(c, 360, 420, at, 0.7)]) {
    const still = m.unproject(next, 360, 420, at);
    assert.ok(Math.abs(still.x - under.x) < 1e-6 && Math.abs(still.y - under.y) < 1e-6, "anchor stays");
  }
  // panBy moves the screen by exactly the finger's move.
  const moved = m.panBy(c, 30, -12);
  const before = m.project(c, 360, 420, p), after = m.project(moved, 360, 420, p);
  assert.ok(Math.abs(after.x - before.x - 30) < 1e-6 && Math.abs(after.y - before.y + 12) < 1e-6, "pan follows finger");
}
assert.equal(m.clampZoom(100), m.ZOOM_MAX);
const goalHit = m.hitStar(map, { x: 0, y: 0, zoom: 1, angle: 0 }, 360, 420, { x: 185, y: 212 });
assert.equal(goalHit?.id, "goal");
assert.equal(m.hitStar(map, { x: 0, y: 0, zoom: 1, angle: 0 }, 360, 420, { x: 5, y: 5 }), null);
console.log("star map contract ok");
