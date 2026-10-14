import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SACRED_ITEMS, SACRED_RARITIES, findSacredItem, nextSacredRarity } from "../lib/sacredItems.ts";

// Catalog: 27 unique items, every rarity of the ladder is used.
assert.equal(SACRED_ITEMS.length, 27);
assert.equal(new Set(SACRED_ITEMS.map((item) => item.key)).size, SACRED_ITEMS.length, "item keys are unique");
for (const rarity of SACRED_RARITIES) assert.ok(SACRED_ITEMS.some((item) => item.rarity === rarity), `rarity ${rarity} has items`);

// Only the two lowest rarities are sold; higher ones come from contracts, so they must have no price.
for (const item of SACRED_ITEMS) {
  assert.ok(item.title.ru && item.title.en && item.description.ru && item.description.en, `${item.key} has RU and EN text`);
  const sold = item.rarity === "common" || item.rarity === "uncommon";
  assert.equal(item.price !== undefined, sold, `${item.key}: only common and uncommon items have a price`);
  if (sold) assert.ok(item.price > 0);
}
assert.equal(findSacredItem("zodiac_aries")?.rarity, "common");
assert.equal(findSacredItem("nope"), null);
assert.equal(findSacredItem({}), null);

// Contract ladder: two items of a rarity make one of the next, the top rarity cannot be upgraded.
assert.equal(nextSacredRarity("common"), "uncommon");
assert.equal(nextSacredRarity("epic"), "legendary");
assert.equal(nextSacredRarity("legendary"), null);
assert.equal(nextSacredRarity("system"), null);
for (const rarity of SACRED_RARITIES.slice(0, -1)) {
  const next = nextSacredRarity(rarity);
  assert.ok(SACRED_ITEMS.some((item) => item.rarity === next), `a contract result exists for ${rarity}`);
}

// Every item has an icon, so no tile falls back to a text glyph.
const icons = readFileSync("components/SacredItemIcon.tsx", "utf8");
for (const item of SACRED_ITEMS) {
  const [group, ...rest] = item.key.split("_");
  const name = rest.join("_");
  const present = group === "zodiac" ? icons.includes(`  ${name}: [[`) : icons.includes(`${item.key}: [`);
  assert.ok(present, `${item.key} has an icon`);
}

// The server never trusts a client price or rarity and scopes idempotency to the user.
const buy = readFileSync("app/api/shop/buy/route.ts", "utf8");
assert.match(buy, /findSacredItem\(body\.itemKey\)/);
assert.match(buy, /p_price: item\.price/);
assert.doesNotMatch(buy, /body\.(price|rarity|title)/);
assert.match(buy, /`shop:\$\{user\.id\}:/);
const merge = readFileSync("app/api/shop/merge/route.ts", "utf8");
assert.match(merge, /nextSacredRarity\(inputs\[0\]\.rarity\)/);
assert.match(merge, /`merge:\$\{user\.id\}:/);
assert.match(merge, /randomInt\(pool\.length\)/);

// The migration keeps the guards the routes rely on.
const migration = readFileSync("supabase/migrations/20261014200000_system_shop_purchase.sql", "utf8");
assert.match(migration, /grant execute on function public\.buy_system_item\([^)]*\) to service_role/);
assert.match(migration, /grant execute on function public\.merge_system_items\([^)]*\) to service_role/);
assert.match(migration, /Insufficient wallet balance\./);
assert.match(migration, /A contract needs two different items\./);
assert.match(migration, /Result must be of the next rarity\./);
assert.match(migration, /'common', 'uncommon', 'rare', 'epic', 'legendary', 'system'/);

console.log("shop contract ok");
