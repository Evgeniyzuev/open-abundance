"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import SacredItemIcon from "@/components/SacredItemIcon";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { nextSacredRarity } from "@/lib/sacredItems";

type OwnedItem = { id: string; title: string; description: string | null; rarity: string; metadata: { glyph?: string; item_key?: string } | null };

async function sendJson(path: string, body: Record<string, unknown>) {
  const response = await fetchWithSupabaseAuth(path, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, { authRequired: true });
  const payload = await response.json() as { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed");
}

/**
 * The item grid of the Results screen: the intro tile (children) followed by the sacred items of the user.
 * Tap an item to read it and put it on sale; Contract mode merges two items of one rarity into the next one.
 */
export default function SacredInventory({ children }: { children?: ReactNode }) {
  const { t } = useUserContext();
  const [items, setItems] = useState<OwnedItem[]>([]);
  const [opened, setOpened] = useState<OwnedItem | null>(null);
  const [price, setPrice] = useState("");
  const [contract, setContract] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchWithSupabaseAuth(`/api/shop/merge?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
      const payload = await response.json() as { items?: OwnedItem[]; error?: string };
      if (response.ok && !payload.error) setItems(payload.items ?? []);
    } catch {
      // Only the intro tile is shown when items cannot be loaded.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<void>, doneText: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ text: doneText, error: false });
      setOpened(null);
      setSelected([]);
      setPrice("");
      await load();
    } catch (actionError) {
      setMessage({ text: actionError instanceof Error ? actionError.message : String(actionError), error: true });
    } finally {
      setBusy(false);
    }
  }

  function sell(item: OwnedItem) {
    const amount = Number(price.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    void run(() => sendJson("/api/marketplace/listings", { artifactId: item.id, listingKind: "digital_asset", priceAmount: amount }), t("market.create"));
  }

  const picked = items.filter((item) => selected.includes(item.id));
  const canMerge = picked.length === 2 && picked[0].rarity === picked[1].rarity && nextSacredRarity(picked[0].rarity) !== null;

  function tap(item: OwnedItem) {
    if (!contract) {
      setOpened(item);
      setPrice("");
      return;
    }
    setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current.slice(-1), item.id]);
  }

  return (
    <>
      {message ? <p className={message.error ? "finance-error" : undefined}>{message.text}</p> : null}
      <div className="results-grid">
        {children}
        {items.map((item) => (
          <button
            className={`results-item-tile${selected.includes(item.id) ? " selected" : ""}`}
            data-rarity={item.rarity}
            aria-pressed={contract ? selected.includes(item.id) : undefined}
            key={item.id}
            type="button"
            onClick={() => tap(item)}
          >
            <span className="results-item-image" aria-hidden="true"><SacredItemIcon itemKey={item.metadata?.item_key} fallback={item.metadata?.glyph ?? item.title.slice(0, 1)} size={64} /></span>
            <strong>{item.title}</strong>
          </button>
        ))}
      </div>
      {items.length >= 2 ? (
        <div className="results-contract-row">
          <button className="secondary-button" type="button" aria-pressed={contract} onClick={() => { setContract(!contract); setSelected([]); }}>{t("shop.contract")}</button>
          {contract ? (
            <button className="challenge-primary-action" type="button" disabled={!canMerge || busy} onClick={() => { void run(() => sendJson("/api/shop/merge", { artifactIds: selected, idempotencyKey: crypto.randomUUID() }), t("shop.merged")); }}>
              {busy ? t("app.common.loading") : t("shop.merge")}
            </button>
          ) : null}
        </div>
      ) : null}
      {opened ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpened(null)}>
          <section className="modal-sheet results-detail-modal" role="dialog" aria-modal="true" aria-label={opened.title} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={() => setOpened(null)}><X size={18} /></button>
            <div className="results-detail-cover" data-rarity={opened.rarity} aria-hidden="true">
              <SacredItemIcon itemKey={opened.metadata?.item_key} fallback={opened.metadata?.glyph ?? opened.title.slice(0, 1)} size={120} />
              <span>{opened.rarity}</span>
            </div>
            <div className="results-detail-body">
              <h1>{opened.title}</h1>
              {opened.description ? <p>{opened.description}</p> : null}
              <input inputMode="decimal" value={price} placeholder={t("market.price")} aria-label={t("market.price")} onChange={(event) => setPrice(event.target.value)} />
              <button className="challenge-primary-action" type="button" disabled={busy || !price.trim()} onClick={() => sell(opened)}>
                {busy ? t("app.common.loading") : t("market.sell")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
