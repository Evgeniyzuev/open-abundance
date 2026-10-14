import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261015100000_wish_products.sql", "utf8");
assert.match(migration, /create table if not exists public\.wish_products/);
assert.match(migration, /alter table public\.wish_products enable row level security/);
assert.match(migration, /using \(owner_user_id = auth\.uid\(\)\)/, "owners read only their own products");
assert.match(migration, /revoke all on public\.wish_products from public, anon, authenticated/);
assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*to authenticated/, "writes stay on the server");
assert.match(migration, /check \(status in \('considering', 'bought', 'dropped'\)\)/);
assert.match(migration, /unique \(owner_user_id, source_url\)/, "one link is added once per person");
assert.doesNotMatch(migration, /alter table public\.wishes/, "products must not change the wishes table that counters rely on");

const list = readFileSync("app/api/wishes/products/route.ts", "utf8");
assert.match(list, /normalizeLinkSource\(body\.url\)/, "only validated http(s) links are fetched");
assert.match(list, /\.eq\("owner_user_id", user\.id\)/);
assert.match(list, /NO_STORE_HEADERS/);
assert.match(list, /23505/, "a duplicate link answers 409");
assert.match(list, /MAX_ACTIVE_PRODUCTS/);

const item = readFileSync("app/api/wishes/products/[productId]/route.ts", "utf8");
assert.equal((item.match(/\.eq\("owner_user_id", user\.id\)/g) ?? []).length, 2, "update and delete are limited to the owner");

const preview = readFileSync("lib/sharePreview.ts", "utf8");
assert.match(preview, /product:price:amount/);
assert.match(preview, /\^\[A-Za-z\]\{3\}\$/, "currency must be a three-letter code");

console.log("wish products contract ok");
