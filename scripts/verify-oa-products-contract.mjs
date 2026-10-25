import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OA_PRODUCTS, PRODUCT_ACCESS_STATUSES, findOaProduct, productKeyOf } from "../lib/oaProducts.ts";
import { parseInline, parseMarkdown } from "../lib/miniMarkdown.ts";
import { render } from "./build-oa-products.mjs";
import { OA_PRODUCT_CONTENT } from "../lib/oaProductContent.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Catalog: unique keys, text fits a listing, no price and no promise of income in the catalog.
assert.equal(new Set(OA_PRODUCTS.map((product) => product.key)).size, OA_PRODUCTS.length);
for (const product of OA_PRODUCTS) {
  assert.ok(product.title.length <= 120, `${product.key}: title fits`);
  assert.ok(product.description.length <= 1000, `${product.key}: description fits`);
  assert.ok(product.description.includes(`/products/${product.key}`), `${product.key}: tells where to open it`);
  assert.ok(!("price" in product), "the price is set at launch, not in the catalog");
  assert.ok(!/гарантир|заработа/i.test(product.description), `${product.key}: no income promises`);
}
assert.equal(findOaProduct("start-kit")?.key, "start-kit");
assert.equal(findOaProduct("nope"), null);
assert.equal(productKeyOf({ product_key: "start-kit" }), "start-kit");
assert.equal(productKeyOf({ product_key: "nope" }), null);
assert.equal(productKeyOf(null), null);
assert.ok(PRODUCT_ACCESS_STATUSES.includes("completed") && !PRODUCT_ACCESS_STATUSES.includes("cancelled"));

// The generated content is in sync with docs/products.
assert.equal(read("lib/oaProductContent.ts"), render(), "run: node scripts/build-oa-products.mjs");

// The reader turns every product into blocks and never produces markup.
for (const product of OA_PRODUCTS) {
  const blocks = parseMarkdown(OA_PRODUCT_CONTENT[product.key]);
  assert.ok(blocks.length > 10, `${product.key}: has content`);
  assert.equal(blocks[0].type, "heading");
}
assert.deepEqual(parseInline("a **b** c"), [{ text: "a ", bold: false }, { text: "b", bold: true }, { text: " c", bold: false }]);
const table = parseMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n");
assert.equal(table[0].type, "table");
assert.deepEqual(parseMarkdown("<script>x</script>")[0].inline[0].text, "<script>x</script>", "text stays text");

// Access is checked on the server from a real purchase; the content is never in a public page.
const api = read("app/api/oa-products/[key]/route.ts");
assert.match(api, /eq\("buyer_user_id", user\.id\)/);
assert.match(api, /PRODUCT_ACCESS_STATUSES/);
assert.ok(!read("app/products/[key]/page.tsx").includes("oaProductContent"), "the page never bundles the text");
const deals = read("app/api/marketplace/deals/route.ts");
assert.match(deals, /accept_marketplace_deal/);
assert.match(deals, /deliver_marketplace_deal/);
const internal = read("app/api/internal/marketplace/oa-products/route.ts");
assert.match(internal, /authorized\(request\)/);
assert.match(internal, /OA_SELLER_USER_ID/);

console.log("oa products contract ok");
