"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type Product = {
  id: string;
  source_url: string;
  title: string;
  image_url: string | null;
  price_amount: number | string | null;
  price_currency: string;
  status: "considering" | "bought" | "dropped";
};

async function call(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetchWithSupabaseAuth(path, { cache: "no-store", ...init }, { authRequired: true });
  const payload = await response.json() as Record<string, unknown> & { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed");
  return payload;
}

/** "Considering to buy": products added by an external link, with picture, title and price. */
export default function WishProducts() {
  const { locale, t, user } = useUserContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", price: "", image: "" });
  const [hintId, setHintId] = useState<string | null>(null);
  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    try {
      const payload = await call(`/api/wishes/products?ts=${Date.now()}`, {});
      setProducts((payload.products as Product[] | undefined) ?? []);
    } catch {
      // The section stays empty when products cannot be loaded.
    }
  }, []);

  useEffect(() => { if (userId) void load(); }, [userId, load]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  }

  function startEditing(product: Product) {
    setEditingId(product.id);
    setDraft({ title: product.title, price: product.price_amount === null ? "" : String(Number(product.price_amount)), image: product.image_url ?? "" });
  }

  if (!userId) return null;
  const visible = products.filter((product) => product.status !== "dropped");

  return (
    <details className="help-profile wish-products">
      <summary>{t("wishes.products.title")}{visible.length ? ` · ${visible.length}` : ""}</summary>
      <form
        className="wish-products-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!url.trim()) return;
          void act(async () => {
            const payload = await call("/api/wishes/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
            const added = payload.product as Product | undefined;
            setUrl("");
            // The shop did not share a picture or a price (some, like Ozon, block automatic reading): open the form to fill them in.
            if (added && (!added.image_url || added.price_amount === null)) {
              setHintId(added.id);
              startEditing(added);
            }
          });
        }}
      >
        <input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" value={url} placeholder={t("wishes.products.placeholder")} aria-label={t("wishes.products.placeholder")} onChange={(event) => setUrl(event.target.value)} />
        <button className="secondary-button" type="submit" disabled={busy || !url.trim()}>{busy ? t("app.common.loading") : t("wishes.add")}</button>
      </form>
      {error ? <p className="finance-error">{error}</p> : null}
      {visible.map((product) => (
        <article className={`wish-product${product.status === "bought" ? " bought" : ""}`} key={product.id}>
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : <span className="wish-product-placeholder" aria-hidden="true" />}
          <div>
            <a className="wish-product-title" href={product.source_url} target="_blank" rel="noreferrer noopener">{product.title}</a>
            {product.price_amount !== null ? <small>{product.price_currency === "USD" ? formatAdaptiveMoney(Number(product.price_amount), locale) : `${Number(product.price_amount)} ${product.price_currency}`}</small> : null}
            <small className="wish-product-host">{hostOf(product.source_url)}</small>
            {hintId === product.id && editingId === product.id ? <small className="wish-product-hint">{t("wishes.products.fillHint")}</small> : null}
            {editingId === product.id ? (
              <form
                className="wish-product-edit"
                onSubmit={(event) => {
                  event.preventDefault();
                  const body: Record<string, unknown> = { title: draft.title.trim(), imageUrl: draft.image.trim() };
                  const amount = draft.price.trim() === "" ? null : Number(draft.price.replace(",", "."));
                  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return;
                  // A changed price is typed by hand, in dollars like everything else in the app; an untouched one keeps the store's currency.
                  if (amount !== (product.price_amount === null ? null : Number(product.price_amount))) { body.priceAmount = amount; body.priceCurrency = "USD"; }
                  void act(async () => {
                    await call(`/api/wishes/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                    setEditingId(null);
                    setHintId(null);
                  });
                }}
              >
                <input value={draft.title} maxLength={240} placeholder={t("wishes.products.titleField")} aria-label={t("wishes.products.titleField")} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                <input inputMode="decimal" value={draft.price} placeholder={t("market.price")} aria-label={t("market.price")} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
                <input type="text" inputMode="url" value={draft.image} placeholder={t("wishes.products.imageField")} aria-label={t("wishes.products.imageField")} onChange={(event) => setDraft({ ...draft, image: event.target.value })} />
                <span className="wish-product-actions">
                  <button className="secondary-button" type="submit" disabled={busy || !draft.title.trim()}>{t("app.common.save")}</button>
                  <button className="text-button" type="button" onClick={() => { setEditingId(null); setHintId(null); }}>{t("app.common.cancel")}</button>
                </span>
              </form>
            ) : null}
            <div className="wish-product-actions">
              <a className="secondary-button wish-product-open" href={product.source_url} target="_blank" rel="noreferrer noopener"><ExternalLink size={15} />{t("wishes.products.open")}</a>
              {editingId !== product.id ? (
                <button className="text-button" type="button" disabled={busy} onClick={() => startEditing(product)}>{t("wishes.products.edit")}</button>
              ) : null}
              {product.status === "considering" ? (
                <button className="text-button" type="button" disabled={busy} onClick={() => { void act(() => call(`/api/wishes/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "bought" }) })); }}>{t("wishes.products.bought")}</button>
              ) : null}
              <button className="text-button danger" type="button" disabled={busy} aria-label={t("app.common.delete")} onClick={() => { void act(() => call(`/api/wishes/products/${product.id}`, { method: "DELETE" })); }}><Trash2 size={15} /></button>
            </div>
          </div>
        </article>
      ))}
    </details>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
