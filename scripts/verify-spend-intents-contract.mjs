import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanSpendCategories, demandMap, DEMAND_MIN_PEOPLE, SPEND_CATEGORIES } from "../lib/spendCategories.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Only known categories survive; duplicates and junk are dropped.
assert.deepEqual(cleanSpendCategories(["food", "food", "learning", "salary", 5, null]), ["food", "learning"]);
assert.deepEqual(cleanSpendCategories("food"), []);

// The demand map hides small groups: a category is shown from five people.
const rows = [];
for (let i = 0; i < DEMAND_MIN_PEOPLE; i += 1) rows.push({ categories: ["food", "learning"] });
rows.push({ categories: ["learning"] }, { categories: ["health"] });
assert.deepEqual(demandMap(rows), [{ category: "learning", people: DEMAND_MIN_PEOPLE + 1 }, { category: "food", people: DEMAND_MIN_PEOPLE }]);
assert.deepEqual(demandMap([{ categories: ["health"] }]), [], "one person is never shown");

// Every category has a title in both languages.
for (const language of ["ru", "en"]) {
  const messages = read(`lib/messages/${language}.ts`);
  for (const category of SPEND_CATEGORIES) assert.ok(messages.includes(`"spend.cat.${category}"`), `${language}: ${category}`);
}

// The migration stores no amounts or free text, and the table is closed to clients.
const sql = read("supabase/migrations/20261021150000_spend_intents.sql");
assert.ok(!/amount|price|text\s+not null/i.test(sql.replace(/--.*$/gm, "")), "no amounts or free text");
assert.match(sql, /revoke all on public\.user_spend_intents from public, anon, authenticated/);
assert.ok(!/delete\s+from|drop\s+table|truncate/i.test(sql));

console.log("spend intents contract ok");
