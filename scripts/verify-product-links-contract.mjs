import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { absoluteUrl, readJsonLdProduct, splitSharedText } from "../lib/productLink.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Shared text from a shop app: the address is the link, the words are the title.
assert.deepEqual(splitSharedText("Смартфон Apple iPhone 15 128 ГБ https://ozon.ru/t/AbC123"), { url: "https://ozon.ru/t/AbC123", title: "Смартфон Apple iPhone 15 128 ГБ" });
assert.deepEqual(splitSharedText("https://www.amazon.com/dp/B0X?tag=a"), { url: "https://www.amazon.com/dp/B0X?tag=a", title: "" });
assert.deepEqual(splitSharedText("«Чайник Bosch» (https://shop.example/p/1)."), { url: "https://shop.example/p/1", title: "Чайник Bosch" });
assert.deepEqual(splitSharedText("no link here"), { url: null, title: "" });

// schema.org Product from JSON-LD: name, picture and price, also inside @graph and with several offers.
const page = (data) => `<html><script type="application/ld+json">${JSON.stringify(data)}</script></html>`;
assert.deepEqual(readJsonLdProduct(page({ "@context": "https://schema.org", "@type": "Product", name: "Kettle", image: ["/img/k.jpg"], offers: { "@type": "Offer", price: "49,90", priceCurrency: "eur" } })), { name: "Kettle", image: "/img/k.jpg", price: 49.9, currency: "EUR" });
assert.deepEqual(readJsonLdProduct(page({ "@graph": [{ "@type": "WebSite" }, { "@type": ["Product"], name: "Lamp", image: { url: "https://x/l.png" }, offers: [{ price: 12 }, { price: 5 }] }] })), { name: "Lamp", image: "https://x/l.png", price: 12, currency: null });
assert.deepEqual(readJsonLdProduct(page({ "@type": "Product", name: "Aggregate", offers: { "@type": "AggregateOffer", lowPrice: 7.5, priceCurrency: "USD" } })), { name: "Aggregate", image: null, price: 7.5, currency: "USD" });
assert.deepEqual(readJsonLdProduct("<html><script type=\"application/ld+json\">{broken</script></html>"), { name: null, image: null, price: null, currency: null }, "broken data is ignored");
assert.deepEqual(readJsonLdProduct("<html></html>"), { name: null, image: null, price: null, currency: null });
assert.equal(absoluteUrl("/img/a.jpg", "https://shop.example/p/1"), "https://shop.example/img/a.jpg");
assert.equal(absoluteUrl("//cdn.example/x.jpg", "https://shop.example/p/1"), "https://cdn.example/x.jpg");
assert.equal(absoluteUrl(null, "https://shop.example"), null);

// Wiring: the loader uses it, the add route accepts shared text, the list links to the store and can be filled by hand.
const preview = read("lib/sharePreview.ts");
assert.ok(preview.includes("readJsonLdProduct(html)") && preview.includes("absoluteUrl(metadata.thumbnailUrl, source.externalUrl)"), "the page loader reads schema.org data and resolves relative pictures");
assert.ok(read("app/api/wishes/products/route.ts").includes("splitSharedText("), "the add route takes shared text");
const patch = read("app/api/wishes/products/[productId]/route.ts");
assert.ok(patch.includes("body.title") && patch.includes("body.imageUrl"), "title and picture can be changed by hand");
const list = read("components/WishProducts.tsx");
assert.ok(list.includes('className="wish-product-title" href={product.source_url}') && list.includes("wishes.products.open"), "the title and a button open the store");
for (const key of ["wishes.products.open", "wishes.products.edit", "wishes.products.titleField", "wishes.products.imageField", "wishes.products.fillHint", "purchase.confirm.title", "purchase.confirm.what", "purchase.confirm.price", "purchase.confirm.pay", "purchase.confirm.noteShop", "purchase.confirm.noteMarket"]) {
  assert.ok(read("lib/messages/en.ts").includes(`"${key}"`) && read("lib/messages/ru.ts").includes(`"${key}"`), `${key} exists in both languages`);
}

// A purchase never starts from the buy button: the Shop and the Market open the confirmation first.
const shop = read("components/SacredShop.tsx");
assert.ok(shop.includes("setPendingKey(item.key)") && !/onClick=\{\(\) => \{ void buy\(item\.key\)/.test(shop) && shop.includes("<ConfirmPurchase"), "the Shop asks before buying");
const market = read("components/wallet/WalletPanels.tsx");
assert.ok(market.includes("onClick={() => setConfirmListing(listing)}") && !market.includes("onClick={() => onBuy(listing.id)}") && market.includes("<ConfirmPurchase"), "the Market asks before buying");
console.log("Product links and purchase confirmation contract verified.");
