"use client";

import { useState } from "react";
import SacredItemIcon from "@/components/SacredItemIcon";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { SACRED_ITEMS, shopCoreBonus } from "@/lib/sacredItems";
import ConfirmPurchase from "@/components/ConfirmPurchase";
import { pick } from "@/lib/locales";

/** System shop: collectible symbolic items for $. Bought items go to Results and can be sold or merged there. */
export function SacredShop({ onPurchased }: { onPurchased: () => void }) {
  const { locale, t } = useUserContext();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function buy(itemKey: string) {
    setPendingKey(null);
    setSavingKey(itemKey);
    setMessage(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/shop/buy", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey, idempotencyKey: crypto.randomUUID() })
      }, { authRequired: true });
      const payload = await response.json() as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed");
      setMessage({ text: t("shop.bought"), error: false });
      onPurchased();
    } catch (buyError) {
      setMessage({ text: buyError instanceof Error ? buyError.message : String(buyError), error: true });
    } finally {
      setSavingKey(null);
    }
  }

  const pending = pendingKey ? SACRED_ITEMS.find((item) => item.key === pendingKey) ?? null : null;

  return (
    <details className="mutual-balance-card">
      <summary>{t("shop.title")}</summary>
      {message ? <p className={message.error ? "finance-error" : undefined}>{message.text}</p> : null}
      <div className="market-grid">
        {SACRED_ITEMS.filter((item) => item.price !== undefined).map((item) => (
          <article className="market-card" key={item.key}>
            <div className="market-card-image">
              <SacredItemIcon itemKey={item.key} fallback={item.glyph} size={48} />
              <small>{item.rarity}</small>
            </div>
            <div className="market-card-body">
              <strong>{pick(locale, item.title)}</strong>
              <div className="market-card-meta">
                <span>{formatAdaptiveMoney(item.price ?? 0, locale)}</span>
                {shopCoreBonus(item) > 0 ? <small>{t("shop.coreBonus", { amount: formatAdaptiveMoney(shopCoreBonus(item), locale) })}</small> : null}
              </div>
              <div className="market-card-actions">
                <button className="text-button" type="button" disabled={savingKey === item.key} onClick={() => setPendingKey(item.key)}>
                  {savingKey === item.key ? t("app.common.loading") : t("market.buy")}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {pending ? (
        <ConfirmPurchase
          title={pick(locale, pending.title)}
          price={formatAdaptiveMoney(pending.price ?? 0, locale)}
          note="purchase.confirm.noteShop"
          onConfirm={() => { void buy(pending.key); }}
          onCancel={() => setPendingKey(null)}
        />
      ) : null}
    </details>
  );
}
