"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { SACRED_ITEMS, nextSacredRarity } from "@/lib/sacredItems";

type OwnedItem = { id: string; title: string; rarity: string };

async function postShop(path: string, body: Record<string, unknown>) {
  const response = await fetchWithSupabaseAuth(path, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() })
  }, { authRequired: true });
  const payload = await response.json() as { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed");
}

/** System shop: collectible symbolic items for $, and the contract that merges two of them into the next rarity. */
export function SacredShop({ onPurchased }: { onPurchased: () => void }) {
  const { locale, t } = useUserContext();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [owned, setOwned] = useState<OwnedItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [price, setPrice] = useState("");

  const loadOwned = useCallback(async () => {
    try {
      const response = await fetchWithSupabaseAuth(`/api/shop/merge?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
      const payload = await response.json() as { items?: OwnedItem[]; error?: string };
      if (response.ok && !payload.error) setOwned(payload.items ?? []);
    } catch {
      // The contract list stays empty when items cannot be loaded.
    }
  }, []);

  useEffect(() => { void loadOwned(); }, [loadOwned]);

  async function run(key: string, action: () => Promise<void>, doneText: string) {
    setSavingKey(key);
    setMessage(null);
    try {
      await action();
      setMessage({ text: doneText, error: false });
      setSelected([]);
      await loadOwned();
      onPurchased();
    } catch (actionError) {
      setMessage({ text: actionError instanceof Error ? actionError.message : String(actionError), error: true });
    } finally {
      setSavingKey(null);
    }
  }

  const picked = owned.filter((item) => selected.includes(item.id));
  const canMerge = picked.length === 2 && picked[0].rarity === picked[1].rarity && nextSacredRarity(picked[0].rarity) !== null;

  async function sell(item: OwnedItem) {
    const amount = Number(price.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    await run(`sell:${item.id}`, async () => {
      const response = await fetchWithSupabaseAuth("/api/marketplace/listings", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId: item.id, listingKind: "digital_asset", priceAmount: amount })
      }, { authRequired: true });
      const payload = await response.json() as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed");
      setSellingId(null);
      setPrice("");
    }, t("market.create"));
  }

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current.slice(-1), id]);
  }

  return (
    <details className="mutual-balance-card">
      <summary>{t("shop.title")}</summary>
      {message ? <p className={message.error ? "finance-error" : undefined}>{message.text}</p> : null}
      <div className="market-grid">
        {SACRED_ITEMS.filter((item) => item.price !== undefined).map((item) => (
          <article className="market-card" key={item.key}>
            <div className="market-card-image">
              <span>{item.glyph}</span>
              <small>{item.rarity}</small>
            </div>
            <div className="market-card-body">
              <strong>{item.title[locale]}</strong>
              <div className="market-card-meta">
                <span>{formatAdaptiveMoney(item.price ?? 0, locale)}</span>
              </div>
              <div className="market-card-actions">
                <button
                  className="text-button"
                  type="button"
                  disabled={savingKey === item.key}
                  onClick={() => { void run(item.key, () => postShop("/api/shop/buy", { itemKey: item.key }), t("shop.bought")); }}
                >
                  {savingKey === item.key ? t("app.common.loading") : t("market.buy")}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {owned.length > 0 ? (
        <>
          <strong>{t("shop.items")}</strong>
          <div className="market-grid">
            {owned.map((item) => (
              <article className="market-card" key={item.id}>
                <div className="market-card-body">
                  <strong>{item.title}</strong>
                  <small>{item.rarity}</small>
                  {sellingId === item.id ? (
                    <div className="market-card-actions">
                      <input
                        inputMode="decimal"
                        value={price}
                        placeholder={t("market.price")}
                        aria-label={t("market.price")}
                        style={{ width: "100%", fontSize: "1rem" }}
                        onChange={(event) => setPrice(event.target.value)}
                      />
                      <button className="text-button" type="button" disabled={savingKey === `sell:${item.id}`} onClick={() => { void sell(item); }}>
                        {savingKey === `sell:${item.id}` ? t("app.common.loading") : t("market.create")}
                      </button>
                    </div>
                  ) : (
                    <div className="market-card-actions">
                      <button className="text-button" type="button" onClick={() => { setSellingId(item.id); setPrice(""); }}>{t("market.sell")}</button>
                      {owned.length >= 2 ? (
                        <button className="text-button" type="button" aria-pressed={selected.includes(item.id)} onClick={() => toggle(item.id)}>
                          {selected.includes(item.id) ? "✓" : "+"}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
          {owned.length >= 2 ? (
            <button
              className="challenge-primary-action"
              type="button"
              disabled={!canMerge || savingKey === "merge"}
              onClick={() => { void run("merge", () => postShop("/api/shop/merge", { artifactIds: selected }), t("shop.merged")); }}
            >
              {savingKey === "merge" ? t("app.common.loading") : `${t("shop.contract")}: ${t("shop.merge")}`}
            </button>
          ) : null}
        </>
      ) : null}
    </details>
  );
}
