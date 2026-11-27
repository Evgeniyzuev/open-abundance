import assert from "node:assert/strict";
const p = await import("../lib/pathTrail.ts");

const quests = [
  { id: "a", title: "Первый шаг", status: "completed", pathOrder: 1, reward: 1, eligible: true },
  { id: "b", title: "Первое желание", status: "completed", pathOrder: 2, reward: 1, eligible: true },
  { id: "c", title: "Бот", status: "completed", pathOrder: 3, reward: 1, eligible: true },
  { id: "d", title: "Сила Core", status: "completed", pathOrder: 4, reward: 2, eligible: true },
  { id: "e", title: "Уведомления", status: "accepted", pathOrder: 5, reward: 1, eligible: true },
  { id: "f", title: "Цель дня", status: null, pathOrder: 6, reward: 1, eligible: true },
  { id: "g", title: "Я не робот", status: null, pathOrder: 7, reward: 1, eligible: true },
  { id: "h", title: "Результат", status: null, pathOrder: 8, reward: 1, eligible: true },
  { id: "i", title: "Ещё", status: null, pathOrder: 9, reward: 1, eligible: true },
  { id: "x", title: "Не на пути", status: null, pathOrder: null, reward: 1, eligible: true }
];
const trail = p.buildTrail({ quests, currentQuestId: "e", calls: [{ id: "k", title: "24 часа без ленты", kind: "call", status: "taken", reward: 0.5 }, { id: "z", title: "old", kind: "call", status: "kept", reward: 0.3 }], sealed: [{ id: "m1", reward: 0.3 }, { id: "m2", reward: 0.2 }, { id: "m3", reward: 0.2 }], chestOpenable: false });
const main = trail.filter((node) => !node.side);
assert.deepEqual(main.map((node) => node.ref), ["b", "c", "d", "e", "f", "g", "h"], "3 done, current, 3 ahead, never the whole path");
assert.deepEqual(main.map((node) => node.state), ["done", "done", "done", "current", "ahead", "ahead", "ahead"]);
assert.deepEqual(trail.filter((node) => node.side).map((node) => node.kind), ["call", "sealed", "sealed"], "settled calls and a third mission stay off");
assert.equal(p.nextTrailStep(trail).ref, "k", "a word already given comes before the quest");
assert.equal(p.nextTrailStep(p.buildTrail({ quests, currentQuestId: "e", calls: [], sealed: [], chestOpenable: true })).kind, "chest");
assert.equal(p.nextTrailStep(p.buildTrail({ quests, currentQuestId: "e", calls: [], sealed: [], chestOpenable: false })).ref, "e");
assert.equal(p.nextTrailStep(p.buildTrail({ quests: [], currentQuestId: null, calls: [], sealed: [{ id: "m", reward: 1 }], chestOpenable: false })).kind, "sealed");
assert.equal(p.nextTrailStep([]), null);

// Off-path current quest still shows as the current point.
const offPath = p.buildTrail({ quests, currentQuestId: "x", calls: [], sealed: [], chestOpenable: false });
assert.equal(offPath.find((node) => node.state === "current").ref, "x");

const layout = p.layoutTrail(trail, 340);
assert.equal(layout.points.length, trail.length);
for (const point of layout.points) {
  assert.ok(point.x >= 0 && point.x <= 340, `x inside: ${point.x}`);
  assert.ok(point.y >= 0 && point.y <= layout.height, `y inside: ${point.y}`);
}
const ys = layout.points.filter((point) => !point.node.side).map((point) => point.y);
assert.ok(ys.every((y, index) => index === 0 || y < ys[index - 1]), "the trail climbs from the bottom");
assert.ok(layout.path.startsWith("M") && layout.donePath.startsWith("M"));
assert.ok(layout.goal.y < Math.min(...ys));

// A busy day (3 words given, 2 sealed missions, a chest) still leaves every point clear of the others.
const busy = p.buildTrail({ quests: quests.slice(0, 6).map((quest, index) => ({ ...quest, status: index < 1 ? "completed" : quest.status })), currentQuestId: "b", calls: [1, 2, 3].map((n) => ({ id: `k${n}`, title: "c", kind: n === 3 ? "mission" : "call", status: "taken", reward: 0.3 })), sealed: [{ id: "s1", reward: 0.2 }, { id: "s2", reward: 0.2 }], chestOpenable: true });
for (const width of [300, 340, 380]) {
  const placed = p.layoutTrail(busy, width).points;
  for (let i = 0; i < placed.length; i += 1) for (let j = i + 1; j < placed.length; j += 1) {
    assert.ok(Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y) >= 40, `points apart at ${width}: ${placed[i].node.id} / ${placed[j].node.id}`);
  }
}

const store = new Map();
const read = (key) => store.get(key) ?? null;
const write = (key, value) => store.set(key, value);
assert.equal(p.pathHomeEnabled("", read, write), true);
assert.equal(p.pathHomeEnabled("?path=0", read, write), false);
assert.equal(p.pathHomeEnabled("", read, write), false);
assert.equal(p.pathHomeEnabled("?path=1", read, write), true);
assert.equal(p.pathHomeEnabled("", read, write), true);
assert.equal(p.pathUi("reward", "ru", { amount: "$1" }), "+$1 Core");
console.log("path trail contract ok");
