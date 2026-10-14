"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";

type ListingSummary = { id: string; title: string; price_amount: number | string; status?: string };
type ExchangeOffer = {
  id: string;
  incoming: boolean;
  status: string;
  message: string | null;
  createdAt: string;
  mine: ListingSummary | null;
  theirs: ListingSummary | null;
  other: { userId: string; name: string | null; level: number } | null;
};

async function postOffer(body: Record<string, unknown>) {
  const response = await fetchWithSupabaseAuth("/api/marketplace/counter-offers", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, { authRequired: true });
  const payload = await response.json() as { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed");
}

/** Pending exchange offers: incoming ones can be accepted or declined, outgoing ones cancelled. */
export function ExchangeOffers({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { locale, t } = useUserContext();
  const [offers, setOffers] = useState<ExchangeOffer[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchWithSupabaseAuth(`/api/marketplace/counter-offers?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
      const payload = await response.json() as { offers?: ExchangeOffer[]; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load");
      setOffers(payload.offers ?? []);
    } catch {
      // The section stays hidden when offers cannot be loaded.
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  async function act(offer: ExchangeOffer, action: "accept" | "decline" | "cancel") {
    setSavingId(offer.id);
    setError(null);
    try {
      await postOffer({ action, offerId: offer.id });
      await load();
      if (action === "accept") onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setSavingId(null);
    }
  }

  const pending = offers.filter((offer) => offer.status === "pending");
  if (!pending.length && !error) return null;
  const money = (value: number | string | undefined) => formatAdaptiveMoney(Number(value ?? 0), locale);

  return (
    <section className="market-exchanges" aria-label={t("market.exchange.title")}>
      <strong>{t("market.exchange.title")}</strong>
      {error ? <p className="finance-error">{error}</p> : null}
      {pending.map((offer) => (
        <article className="market-exchange-row" key={offer.id}>
          <p>
            <span>{offer.incoming ? t("market.exchange.incoming", { name: offer.other?.name ?? "—" }) : t("market.exchange.outgoing", { name: offer.other?.name ?? "—" })}</span>
          </p>
          <div className="market-exchange-pair">
            <span><small>{t("market.exchange.youGet")}</small><strong>{offer.theirs?.title ?? "—"}</strong><em>{money(offer.theirs?.price_amount)}</em></span>
            <ArrowLeftRight size={18} aria-hidden="true" />
            <span><small>{t("market.exchange.youGive")}</small><strong>{offer.mine?.title ?? "—"}</strong><em>{money(offer.mine?.price_amount)}</em></span>
          </div>
          {offer.message ? <p className="market-exchange-message">{offer.message}</p> : null}
          <div className="market-card-actions">
            {offer.incoming ? (
              <>
                <button className="text-button" type="button" disabled={savingId === offer.id} onClick={() => void act(offer, "accept")}>{t("market.exchange.accept")}</button>
                <button className="text-button danger" type="button" disabled={savingId === offer.id} onClick={() => void act(offer, "decline")}>{t("market.exchange.decline")}</button>
              </>
            ) : (
              <button className="text-button danger" type="button" disabled={savingId === offer.id} onClick={() => void act(offer, "cancel")}>{t("market.exchange.cancel")}</button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

/** Choose one of your active listings to offer in exchange for another seller's listing. */
export function ExchangeOfferDialog({ target, myListings, onClose, onCreated }: {
  target: ListingSummary;
  myListings: ListingSummary[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { locale, t } = useUserContext();
  const [offeredId, setOfferedId] = useState(myListings[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!offeredId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await postOffer({ action: "create", targetListingId: target.id, offeredListingId: offeredId, message });
      onCreated();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet market-exchange-sheet" role="dialog" aria-modal="true" aria-labelledby="exchange-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={18} /></button>
        <div className="modal-header"><span /><h2 id="exchange-title">{t("market.exchange.offer")}</h2></div>
        <p className="market-exchange-target">
          <small>{t("market.exchange.youGet")}</small>
          <strong>{target.title}</strong>
          <em>{formatAdaptiveMoney(Number(target.price_amount), locale)}</em>
        </p>
        <fieldset className="market-exchange-choices">
          <legend>{t("market.exchange.chooseYours")}</legend>
          {myListings.map((listing) => (
            <label key={listing.id}>
              <input type="radio" name="offered-listing" value={listing.id} checked={offeredId === listing.id} onChange={() => setOfferedId(listing.id)} />
              <span>{listing.title}</span>
              <em>{formatAdaptiveMoney(Number(listing.price_amount), locale)}</em>
            </label>
          ))}
        </fieldset>
        <label>
          <span className="sr-only">{t("market.exchange.message")}</span>
          <textarea value={message} maxLength={280} rows={2} placeholder={t("market.exchange.message")} onChange={(event) => setMessage(event.target.value)} />
        </label>
        {error ? <p className="finance-error" role="alert">{error}</p> : null}
        <button className="challenge-primary-action" type="button" disabled={!offeredId || saving} onClick={() => void submit()}>
          <ArrowLeftRight size={16} aria-hidden="true" />{t("market.exchange.send")}
        </button>
      </section>
    </div>
  );
}

type MutualPeriod = { purchases: number; sales: number; balance: number; purchaseCount: number; saleCount: number };

/** Owner-only: Marketplace purchases minus sales. Hidden until the first completed deal. */
export function MutualBalanceCard({ refreshKey }: { refreshKey: number }) {
  const { locale, t } = useUserContext();
  const [data, setData] = useState<{ windowDays: number; window: MutualPeriod; lifetime: MutualPeriod } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/marketplace/mutual-balance?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
        const payload = await response.json() as { mutualBalance?: { windowDays: number; window: MutualPeriod; lifetime: MutualPeriod }; error?: string };
        if (!cancelled && response.ok && payload.mutualBalance) setData(payload.mutualBalance);
      } catch {
        // Optional card.
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (!data || data.lifetime.purchaseCount + data.lifetime.saleCount === 0) return null;
  const money = (value: number) => formatAdaptiveMoney(Math.abs(Number(value)), locale);
  const balance = Number(data.lifetime.balance);

  return (
    <details className="mutual-balance-card">
      <summary>
        <span><small>{t("market.mutual.title")}</small><strong>{balance > 0 ? "+" : balance < 0 ? "−" : ""}{money(balance)}</strong></span>
      </summary>
      <p>{t("market.mutual.explainer")}</p>
      <dl>
        <div><dt>{t("market.mutual.purchases")}</dt><dd>{money(data.lifetime.purchases)} · {data.lifetime.purchaseCount}</dd></div>
        <div><dt>{t("market.mutual.sales")}</dt><dd>{money(data.lifetime.sales)} · {data.lifetime.saleCount}</dd></div>
      </dl>
    </details>
  );
}
