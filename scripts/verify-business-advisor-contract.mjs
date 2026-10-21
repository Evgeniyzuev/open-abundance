import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBusinessInstruction, wantsBusinessHelp } from "../lib/businessAdvisor.ts";

// The mode starts only from the person's own recent words.
assert.equal(wantsBusinessHelp([{ role: "user", content: "Хочу начать свой бизнес" }]), true);
assert.equal(wantsBusinessHelp([{ role: "user", content: "I need my first customer" }]), true);
assert.equal(wantsBusinessHelp([{ role: "user", content: "Как работает Core?" }]), false);
assert.equal(wantsBusinessHelp([{ role: "assistant", content: "бизнес" }]), false, "assistant words do not switch the mode");
assert.equal(wantsBusinessHelp([
  { role: "user", content: "бизнес" }, { role: "user", content: "a" }, { role: "user", content: "b" }, { role: "user", content: "c" }
]), false, "only the last three user messages count");

// The instruction carries the honesty rules and the facts, nothing more.
const text = buildBusinessInstruction("ru", { ownCategories: ["food"], demand: [{ category: "learning", people: 7 }], activeListings: 1, completedSales: 2 });
assert.match(text, /Never promise income/);
assert.match(text, /never decide questions of money or rules/);
assert.match(text, /learning \(7\)/);
assert.match(text, /completed sales 2/);
assert.match(buildBusinessInstruction("en", { ownCategories: [], demand: [], activeListings: 0, completedSales: 0 }), /none yet/);

// The route wires the mode in only for the main chat, not the second look.
const route = readFileSync(new URL("../app/api/ai/chat/route.ts", import.meta.url), "utf8");
assert.match(route, /!followup && wantsBusinessHelp\(messages\)/);

console.log("business advisor contract ok");
