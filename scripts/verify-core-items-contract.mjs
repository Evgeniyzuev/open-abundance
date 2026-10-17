import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CORE_ITEMS, findCoreItem } from "../lib/coreItems.ts";

// Catalog: unique keys, a price per item, every rarity once, bilingual texts.
const keys = new Set(CORE_ITEMS.map((item) => item.key));
assert.equal(keys.size, CORE_ITEMS.length, "item keys are unique");
for (const item of CORE_ITEMS) {
  assert.ok(item.key.startsWith("core_"), `${item.key} uses the core_ prefix`);
  assert.ok(Number.isFinite(item.price) && item.price > 0, `${item.key} has a price`);
  assert.ok(item.title.ru && item.title.en && item.lore.ru && item.lore.en, `${item.key} has both languages`);
}
assert.deepEqual(CORE_ITEMS.map((item) => item.rarity), ["common", "uncommon", "rare", "epic", "legendary"]);
assert.equal(findCoreItem("core_watering_can")?.price, 5);
assert.equal(findCoreItem("zodiac_leo"), null);
assert.equal(findCoreItem(42), null);

// Migration: exactly P moves through the existing top-up, no bonus, service role only, marked item.
const migration = readFileSync(new URL("../supabase/migrations/20261016120000_core_items.sql", import.meta.url), "utf8");
assert.match(migration, /public\.wallet_core_topup\(p_user_id, p_price,/, "the price goes through wallet_core_topup");
assert.ok(!/update public\.core_accounts/.test(migration), "Core changes only inside wallet_core_topup");
assert.match(migration, /'core_bonus_applied', true/);
assert.match(migration, /revoke all on function public\.buy_core_item\([^)]*\) from public, anon, authenticated;/);
assert.match(migration, /grant execute on function public\.buy_core_item\([^)]*\) to service_role;/);

// Route: catalog price only, idempotency key required.
const route = readFileSync(new URL("../app/api/core/items/route.ts", import.meta.url), "utf8");
assert.match(route, /p_price: item\.price/, "the price comes from the catalog");
assert.ok(!/body\.price|body\.amount/.test(route), "a client price is never used");
assert.match(route, /Idempotency key is required/);

// Icons and translations exist for every item.
const icons = readFileSync(new URL("../components/SacredItemIcon.tsx", import.meta.url), "utf8");
for (const item of CORE_ITEMS) assert.ok(icons.includes(`${item.key}:`), `${item.key} has an icon`);
for (const file of ["../lib/messages/en.ts", "../lib/messages/ru.ts"]) {
  const messages = readFileSync(new URL(file, import.meta.url), "utf8");
  for (const rarity of ["common", "uncommon", "rare", "epic", "legendary"]) assert.ok(messages.includes(`"coreGarden.rarity.${rarity}"`), `${file}: ${rarity}`);
  assert.ok(messages.includes('"coreGarden.note"'), `${file} has the not-a-guarantee note`);
}
// A bought garden item shows up on the Results screen but never enters a contract.
const inventoryRoute = readFileSync(new URL("../app/api/shop/merge/route.ts", import.meta.url), "utf8");
assert.ok(/\.in\("artifact_type", \["sacred_item", "core_item"\]\)/.test(inventoryRoute), "the Results list includes the Core garden items");
const inventory = readFileSync(new URL("../components/SacredInventory.tsx", import.meta.url), "utf8");
assert.ok(inventory.includes('item.artifact_type !== "core_item"') && inventory.includes("if (!canMergeItem(item)) return;"), "a garden item cannot be picked for a contract");
const shopSql = readFileSync(new URL("../supabase/migrations/20261014200000_system_shop_purchase.sql", import.meta.url), "utf8");
assert.ok(/artifact_type = 'sacred_item'/.test(shopSql), "the server contract only takes sacred items, so garden items cannot be cashed into a higher rarity");
console.log("Core items contract verified.");
