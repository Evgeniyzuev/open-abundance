import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- Visible-only polling, with a fake page and fake timers ---
const listeners = new Set();
let nextTimer = 1;
const timers = new Map();
globalThis.document = {
  visibilityState: "visible",
  addEventListener: (type, listener) => { if (type === "visibilitychange") listeners.add(listener); },
  removeEventListener: (type, listener) => { if (type === "visibilitychange") listeners.delete(listener); }
};
globalThis.setInterval = (callback) => { const id = nextTimer++; timers.set(id, callback); return id; };
globalThis.clearInterval = (id) => { timers.delete(id); };
const tick = () => [...timers.values()].forEach((callback) => callback());
const setVisibility = (state) => { document.visibilityState = state; listeners.forEach((listener) => listener()); };

const { startVisiblePolling } = await import("../lib/visiblePolling.ts");
let calls = 0;
const stop = startVisiblePolling(() => { calls += 1; }, 1000);
assert.equal(calls, 0, "no extra request on start: same behaviour as setInterval");
tick();
assert.equal(calls, 1);
setVisibility("hidden");
assert.equal(timers.size, 0, "hidden tab: no timer, no requests");
tick();
assert.equal(calls, 1);
setVisibility("visible");
assert.equal(calls, 2, "back to visible: one immediate check");
assert.equal(timers.size, 1, "and the interval resumes");
stop();
assert.equal(timers.size, 0);
assert.equal(listeners.size, 0, "stop removes the listener");
setVisibility("hidden");
setVisibility("visible");
assert.equal(calls, 2, "a stopped poll never runs again");

document.visibilityState = "hidden";
const hiddenStart = startVisiblePolling(() => { calls += 1; }, 1000);
assert.equal(timers.size, 0, "a poll started in a hidden tab waits for visibility");
hiddenStart();

for (const path of ["components/CryptoPayDepositModal.tsx", "components/HumanityCard.tsx", "components/TonUsdtWalletModals.tsx", "components/wallet/WalletModals.tsx"]) {
  const source = readFileSync(path, "utf8");
  assert.match(source, /startVisiblePolling\(/, `${path} polls only while visible`);
}
assert.doesNotMatch(readFileSync("components/CryptoPayDepositModal.tsx", "utf8"), /window\.setInterval/);

// --- Batched analytics ---
const { ANALYTICS_BATCH_MAX, parseAnalyticsEvents } = await import("../lib/analyticsBatch.ts");
assert.deepEqual(parseAnalyticsEvents({ anonymousId: "a", eventName: "app_open", properties: { authenticated: true } }), [{ eventName: "app_open", properties: { authenticated: true } }], "the old single-event body still works");
const batch = parseAnalyticsEvents({ events: [
  { eventName: "feed_post_impression", properties: { post_id: "p1", nested: { no: true } } },
  { eventName: "Bad Name" },
  ...Array.from({ length: 40 }, () => ({ eventName: "growth_map_opened" }))
] });
assert.equal(batch.length, ANALYTICS_BATCH_MAX - 1, "a batch is capped and invalid names are dropped");
assert.deepEqual(batch[0].properties, { post_id: "p1" }, "only flat properties are kept");
assert.deepEqual(parseAnalyticsEvents(null), []);

const route = readFileSync("app/api/analytics/events/route.ts", "utf8");
assert.match(route, /recordProductEvents\(/, "one insert per batch");
assert.equal((route.match(/auth\.getUser\(/g) ?? []).length, 1, "one auth check per batch");
const queue = readFileSync("lib/analyticsQueue.ts", "utf8");
assert.match(queue, /keepalive: true/, "events survive closing the page");
assert.match(queue, /pagehide/);
assert.match(readFileSync("lib/productAnalytics.ts", "utf8"), /enqueueAnalyticsEvent/);
assert.match(readFileSync("lib/clientAnalytics.ts", "utf8"), /enqueueAnalyticsEvent/);

// --- AI tools: sign-in and quota through the existing chat quota tables ---
const guard = readFileSync("lib/ai/toolGuard.ts", "utf8");
assert.match(guard, /reserveAiChatMessage\(user\.id, \{ capability: bucket/, "tool quota reuses the chat quota tables");
assert.match(guard, /"tools\.organize": \{ dayLimit: 30, monthLimit: 300 \}/);
assert.match(guard, /"reflection\.process": \{ dayLimit: 40, monthLimit: 400 \}/);
assert.match(guard, /status: 401/);
assert.match(guard, /status: 429/);
for (const [path, bucket] of [
  ["app/api/ai/tasks/decompose/route.ts", "tools.organize"],
  ["app/api/ai/notes/triage/route.ts", "tools.organize"],
  ["app/api/ai/decisions/choose/route.ts", "tools.organize"],
  ["app/api/ai/routines/plan/route.ts", "tools.organize"],
  ["app/api/ai/market/listing-draft/route.ts", "tools.organize"],
  ["app/api/ai/reflections/step/route.ts", "reflection.process"]
]) {
  const source = readFileSync(path, "utf8");
  const guardAt = source.indexOf(`guardAiTool(request, "${bucket}")`);
  assert.ok(guardAt > 0, `${path} requires sign-in and quota`);
  assert.ok(guardAt < source.indexOf("await generateAiJson"), `${path} checks quota before calling the provider`);
  assert.match(source, /catch \(error\) \{\s*\/\/[^\n]*\n\s*await guard\.refund\(\);/, `${path} returns the tap to the quota on failure`);
}
for (const path of ["components/TaskStepSuggester.tsx", "components/BrainDumpModal.tsx", "components/DecisionModal.tsx", "components/RoutinePlanModal.tsx", "components/ReflectionProcessor.tsx"]) {
  const source = readFileSync(path, "utf8");
  assert.match(source, /postAiTool\(/, `${path} sends the session token`);
  assert.doesNotMatch(source, /fetch\("\/api\/ai\//, `${path} has no unauthenticated AI call left`);
}

console.log("Low-load contract verified: visible-only polling, batched analytics and AI tool quota.");
