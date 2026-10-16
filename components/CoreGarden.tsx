"use client";

import { useState } from "react";
import SacredItemIcon from "@/components/SacredItemIcon";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { CORE_ITEMS, type CoreItem } from "@/lib/coreItems";
import { coreGrowthFactor } from "@/lib/coreTicker";
import { formatAdaptiveMoney, formatMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

const GROWTH_YEARS = [1, 3, 10, 30] as const;

/**
 * Core items ("Сад Core"): buying an item from the system moves exactly its price from Wallet to Core
 * and the item stays in the collection. A purchase always goes through a confirmation that shows the
 * estimated growth of that amount (a scenario at the current rate, not a promise).
 */
export default function CoreGarden({ walletBalance, locale, t, onPurchased }: { walletBalance: number; locale: AppLocale; t: TFunction; onPurchased: () => Promise<void> | void }) {
  const [selected, setSelected] = useState<CoreItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [requestKey, setRequestKey] = useState("");

  function choose(item: CoreItem) {
    setSelected(selected?.key === item.key ? null : item);
    setRequestKey(crypto.randomUUID());
    setMessage(null);
  }

  async function buy(item: CoreItem) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/core/items", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: item.key, idempotencyKey: requestKey })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed");
      setSelected(null);
      setMessage({ text: t("coreGarden.bought", { item: item.title[locale], amount: formatAdaptiveMoney(item.price, locale) }), error: false });
      await onPurchased();
    } catch (buyError) {
      const text = buyError instanceof Error ? buyError.message : String(buyError);
      setMessage({ text: text === "Insufficient wallet balance." ? t("wallet.topup.error.insufficient") : text, error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mutual-balance-card core-garden" aria-label={t("coreGarden.title")}>
      <div className="core-garden-body">
        <small className="core-garden-subtitle">{t("coreGarden.subtitle")}</small>
        {message ? <p className={message.error ? "finance-error" : "core-garden-success"} role="status">{message.text}</p> : null}
        <ul className="core-garden-list">
          {CORE_ITEMS.map((item) => {
            const open = selected?.key === item.key;
            const short = Math.max(0, item.price - walletBalance);
            return (
              <li className={`core-garden-item rarity-${item.rarity}${open ? " is-open" : ""}`} key={item.key}>
                <button className="core-garden-row" type="button" aria-expanded={open} onClick={() => choose(item)}>
                  <span className="core-garden-icon"><SacredItemIcon itemKey={item.key} fallback={item.glyph} size={36} /></span>
                  <span className="core-garden-name"><strong>{item.title[locale]}</strong><small>{t(`coreGarden.rarity.${item.rarity}` as MessageKey)}</small></span>
                  <span className="core-garden-price">+{formatAdaptiveMoney(item.price, locale)}</span>
                </button>
                {open ? (
                  <div className="core-garden-confirm">
                    <p>{item.lore[locale]}</p>
                    <p className="core-garden-effect">{t("coreGarden.effect", { amount: formatAdaptiveMoney(item.price, locale) })}</p>
                    <ul className="core-garden-growth" aria-label={t("coreTicker.growth")}>
                      {GROWTH_YEARS.map((years) => (
                        <li key={years}><span>{t(`coreTicker.y${years}` as MessageKey)}</span><b>{formatMoney(item.price * coreGrowthFactor(years), locale)}</b></li>
                      ))}
                    </ul>
                    <small>{t("coreGarden.note")}</small>
                    {short > 0 ? <p className="finance-error">{t("coreGarden.short", { amount: formatAdaptiveMoney(short, locale) })}</p> : null}
                    <div className="core-garden-actions">
                      <button className="text-button" type="button" onClick={() => setSelected(null)}>{t("app.common.cancel")}</button>
                      <button className="primary-button" type="button" disabled={saving || short > 0} onClick={() => { void buy(item); }}>
                        {saving ? t("app.common.loading") : t("coreGarden.buy", { amount: formatAdaptiveMoney(item.price, locale) })}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
