// Pure helpers for the "Considering" product list (no imports, tested directly by node).

export type JsonLdProduct = { name: string | null; image: string | null; price: number | null; currency: string | null };

/**
 * A product link usually arrives as shared text ("Phone X 128 GB https://shop/..."): the first address is the link,
 * the words around it are a title the person already got from the shop app.
 */
export function splitSharedText(input: string): { url: string | null; title: string } {
  const match = input.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return { url: null, title: "" };
  const url = match[0].replace(/[),.;!?]+$/, "");
  const title = input.replace(match[0], " ").replace(/\s+/g, " ").trim().replace(/^[\s"'«»()\[\]:,.\-–—]+|[\s"'«»()\[\]:,.\-–—]+$/g, "").slice(0, 240);
  return { url, title };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 && value < 1e12 ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) && number < 1e12 ? number : null;
}

function firstImage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(firstImage).find(Boolean) ?? null;
  if (value && typeof value === "object") return firstImage((value as { url?: unknown }).url);
  return null;
}

function offerOf(value: unknown): { price: number | null; currency: string | null } {
  const offers = Array.isArray(value) ? value : value ? [value] : [];
  for (const offer of offers as Array<Record<string, unknown>>) {
    if (!offer || typeof offer !== "object") continue;
    const price = toNumber(offer.price) ?? toNumber(offer.lowPrice);
    const currency = typeof offer.priceCurrency === "string" && /^[A-Za-z]{3}$/.test(offer.priceCurrency.trim()) ? offer.priceCurrency.trim().toUpperCase() : null;
    if (price !== null) return { price, currency };
    const nested = offerOf(offer.offers);
    if (nested.price !== null) return nested;
  }
  return { price: null, currency: null };
}

function collectProducts(node: unknown, out: Array<Record<string, unknown>>): void {
  if (Array.isArray(node)) { node.forEach((item) => collectProducts(item, out)); return; }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => typeof item === "string" && /^(Product|IndividualProduct|ProductGroup)$/i.test(item))) out.push(record);
  if (record["@graph"]) collectProducts(record["@graph"], out);
}

/** The name, picture and price a shop publishes for search engines (schema.org Product in JSON-LD). */
export function readJsonLdProduct(html: string): JsonLdProduct {
  const result: JsonLdProduct = { name: null, image: null, price: null, currency: null };
  for (const block of html.match(/<script\b[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? []) {
    const body = block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { continue; }
    const products: Array<Record<string, unknown>> = [];
    collectProducts(parsed, products);
    for (const product of products) {
      if (!result.name && typeof product.name === "string" && product.name.trim()) result.name = product.name.trim().slice(0, 240);
      if (!result.image) result.image = firstImage(product.image);
      if (result.price === null) {
        const offer = offerOf(product.offers);
        result.price = offer.price;
        result.currency = offer.currency;
      }
    }
  }
  return result;
}

/** A picture address from a page can be relative ("/img/a.jpg" or "//cdn/x.jpg"); it becomes absolute against the page. */
export function absoluteUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  try {
    return new URL(value.trim(), base).href;
  } catch {
    return null;
  }
}
