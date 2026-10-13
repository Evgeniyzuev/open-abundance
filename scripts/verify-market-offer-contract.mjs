import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARKET_TEMPLATE_COUNT, MARKET_TEMPLATES, normalizeListingDraft } from "../lib/marketListingDraft.ts";

assert.equal(normalizeListingDraft({ title: "", description: "x" }), null, "a draft needs a title");
assert.equal(normalizeListingDraft({ title: "x", description: "" }), null, "and a description");
const draft = normalizeListingDraft({ title: "  Proofread   2 pages ", description: "Line\n\n\n\nLine", listingKind: "weird", fulfillmentDays: 5 });
assert.equal(draft.title, "Proofread 2 pages");
assert.equal(draft.description, "Line\n\nLine");
assert.equal(draft.listingKind, "service", "unknown kinds fall back to a service");
assert.equal(draft.fulfillmentDays, 7, "a tie between allowed delivery times picks the longer, safer promise");
assert.equal(normalizeListingDraft({ title: "x", description: "y", fulfillmentDays: 2 }).fulfillmentDays, 1, "otherwise the nearest allowed time");
assert.equal(normalizeListingDraft({ title: "x", description: "y", fulfillmentDays: "soon" }).fulfillmentDays, 7);
assert.ok(!("price" in draft), "a draft never carries a price");

assert.equal(MARKET_TEMPLATES.length, MARKET_TEMPLATE_COUNT);
const i18n = readFileSync("lib/i18n.ts", "utf8");
for (const template of MARKET_TEMPLATES) {
  assert.equal(i18n.split(`"marketTemplate.${template.n}.title":`).length - 1, 2, `template ${template.n} title in RU and EN`);
  assert.equal(i18n.split(`"marketTemplate.${template.n}.description":`).length - 1, 2, `template ${template.n} description in RU and EN`);
}

const route = readFileSync("app/api/ai/market/listing-draft/route.ts", "utf8");
assert.match(route, /capability: "market\.listing"/);
assert.match(route, /<skill_data>/);
assert.match(route, /guardAiTool\(request, "tools\.organize"\)/);
assert.match(route, /hasSafetyText\(skill\)/);
assert.match(route, /Do not include a price/);
const knowledge = readFileSync("lib/ai/knowledge.ts", "utf8");
assert.match(knowledge, /Do not suggest or include a price/);
assert.match(knowledge, /regulated professional advice/);

const helper = readFileSync("components/MarketOfferHelper.tsx", "utf8");
assert.doesNotMatch(helper, /setPrice|priceAmount|onCreate/, "the helper only fills the form; price and publishing stay with the person");
const wallet = readFileSync("components/WalletApp.tsx", "utf8");
const applyBlock = wallet.slice(wallet.indexOf("function applyOfferDraft"), wallet.indexOf("function applyOfferDraft") + 500);
assert.doesNotMatch(applyBlock, /setPrice/, "a prefilled offer never sets a price");

console.log("Market offer contract verified.");
