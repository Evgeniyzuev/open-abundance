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
  const [pricingId, setPricingId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
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
            await call("/api/wishes/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
            setUrl("");
          });
        }}
      >
        <input type="url" inputMode="url" value={url} placeholder={t("wishes.products.placeholder")} aria-label={t("wishes.products.placeholder")} onChange={(event) => setUrl(event.target.value)} />
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
            <strong>{product.title}</strong>
            {product.price_amount !== null ? <small>{product.price_currency === "USD" ? formatAdaptiveMoney(Number(product.price_amount), locale) : `${Number(product.price_amount)} ${product.price_currency}`}</small> : null}
            {pricingId === product.id ? (
              <form
                className="wish-products-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const amount = Number(priceDraft.replace(",", "."));
                  if (!Number.isFinite(amount) || amount < 0) return;
                  void act(async () => {
                    await call(`/api/wishes/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priceAmount: amount, priceCurrency: "USD" }) });
                    setPricingId(null);
                    setPriceDraft("");
                  });
                }}
              >
                <input inputMode="decimal" value={priceDraft} placeholder={t("market.price")} aria-label={t("market.price")} onChange={(event) => setPriceDraft(event.target.value)} />
                <button className="secondary-button" type="submit" disabled={busy || !priceDraft.trim()}>{t("app.common.save")}</button>
              </form>
            ) : null}
            <div className="wish-product-actions">
              <a className="text-button" href={product.source_url} target="_blank" rel="noreferrer noopener" aria-label={product.title}><ExternalLink size={15} /></a>
              {pricingId !== product.id ? (
                <button className="text-button" type="button" disabled={busy} onClick={() => { setPricingId(product.id); setPriceDraft(product.price_amount === null ? "" : String(Number(product.price_amount))); }}>{t("market.price")}</button>
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
