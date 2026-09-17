"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

type P2PData = {
  tradingEnabled: boolean;
  member: { status: string; verified_name?: string | null };
  limit: { availableAmount: number; outstandingRisk: number; rolling24hTurnover: number; coreSecurity: number; trustFactor: number; trustEnforced: boolean; maturedCounterparties: number };
  collateral: { amount: number; reserved_amount: number };
  paymentMethods: Array<{ id: string; method_type: string; label: string; masked_details: string }>;
  ads: Array<{ id: string; seller_user_id: string; available_amount: number; rub_per_wallet: number; min_wallet_amount: number; max_wallet_amount: number; payment_method: { label: string; masked_details: string } | Array<{ label: string; masked_details: string }> }>;
  orders: Array<{ id: string; buyer_user_id: string; seller_user_id: string; wallet_amount: number; rub_amount: number; status: string; payment_due_at: string; receipt_confirmation_due_at?: string | null; coverage_until?: string | null; dispute?: { status: string; resolution?: string | null } | null }>;
  fund: { availableAmount: number; verifiedAt: string | null } | null;
  error?: string;
};

export default function P2PWalletPanel({ active }: { active: boolean }) {
  const { t, user } = useUserContext();
  const [data, setData] = useState<P2PData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ label: "", holderName: "", paymentTarget: "", bankName: "", methodType: "sbp" });
  const [adForm, setAdForm] = useState({ paymentMethodId: "", walletAmount: "100", rubPerWallet: "100", minWalletAmount: "10", maxWalletAmount: "100" });
  const [collateralAmount, setCollateralAmount] = useState("");
  const [sellerTermsAccepted, setSellerTermsAccepted] = useState(false);
  const [buyerTermsAccepted, setBuyerTermsAccepted] = useState<Record<string, boolean>>({});
  const [buyAmounts, setBuyAmounts] = useState<Record<string, string>>({});
  const [disputeReasons, setDisputeReasons] = useState<Record<string, string>>({});
  const [revealedDetails, setRevealedDetails] = useState<Record<string, Record<string, string>>>({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/p2p?ts=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" } });
      const payload = await response.json() as P2PData;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load P2P.");
      setData(payload);
      setAdForm((current) => ({ ...current, paymentMethodId: current.paymentMethodId || payload.paymentMethods[0]?.id || "" }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load P2P.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (active) void load(); }, [active, load]);
  useEffect(() => { setRevealedDetails({}); setData(null); }, [user?.id]);

  async function mutate(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/p2p", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "P2P action failed.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "P2P action failed.");
    } finally {
      setSaving(false);
    }
  }

  async function revealPaymentDetails(orderId: string) {
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/p2p/orders/${orderId}/payment-details`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { details?: Record<string, string>; error?: string };
      if (!response.ok || payload.error || !payload.details) throw new Error(payload.error ?? "Payment details are unavailable.");
      setRevealedDetails((current) => ({ ...current, [orderId]: payload.details! }));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Payment details are unavailable.");
    }
  }

  if (!user) return null;
  if (loading && !data) return <section className="market-panel p2p-panel"><p className="finance-error neutral">{t("app.common.loading")}</p></section>;
  if (!data) return <section className="market-panel p2p-panel">{error ? <p className="finance-error">{error}</p> : null}</section>;

  const memberActive = !["suspended", "revoked"].includes(data.member.status);
  return (
    <section className="market-panel p2p-panel">
      <div className="market-head"><div><span>{t("p2p.kicker")}</span><strong>{t("p2p.title")}</strong><small>{t("p2p.closedPilot")}</small></div><button className="text-button" type="button" onClick={() => void load()}>{t("app.common.refresh")}</button></div>
      {error ? <p className="finance-error" role="alert">{error}</p> : null}
      {!memberActive ? <div className="finance-state"><strong>{t("p2p.access.title")}</strong><p>{t("p2p.access.description")}</p><small>{t("p2p.access.status", { status: data.member.status })}</small></div> : null}
      {memberActive ? <>
        {!data.tradingEnabled ? <p className="finance-error neutral">{t("p2p.tradingPaused")}</p> : null}
        <div className="p2p-metrics">
          <article><span>{t("p2p.limit.available")}</span><strong>{money(data.limit.availableAmount)} Wallet $</strong></article>
          <article><span>{t("p2p.fund.available")}</span><strong>{money(data.fund?.availableAmount ?? 0)} Wallet $</strong></article>
          <article><span>{t("p2p.limit.core")}</span><strong>{money(data.limit.coreSecurity)} Wallet $</strong></article>
          <article><span>{t("p2p.limit.covered")}</span><strong>{money(data.limit.outstandingRisk)} Wallet $</strong></article>
          <article><span>{t("p2p.collateral.balance")}</span><strong>{money(data.collateral.amount)} Wallet $</strong></article>
        </div>
        <small className="p2p-policy-note">{t(data.limit.trustEnforced ? "p2p.trust.enforced" : "p2p.trust.shadow", { factor: data.limit.trustFactor, count: data.limit.maturedCounterparties })}</small>

        <details className="p2p-form-card">
          <summary>{t("p2p.collateral.title")}</summary>
          <div className="p2p-form-grid">
            <label className="finance-field"><span>{t("p2p.amount.wallet")}</span><input inputMode="decimal" value={collateralAmount} onChange={(event) => setCollateralAmount(event.target.value)} /></label>
            <div className="market-card-actions">
              <button className="challenge-primary-action" type="button" disabled={saving || !data.tradingEnabled || !(Number(collateralAmount) > 0)} onClick={() => void mutate({ action: "change_collateral", amount: Number(collateralAmount), idempotencyKey: crypto.randomUUID() })}>{t("p2p.collateral.add")}</button>
              <button className="text-button" type="button" disabled={saving || !(Number(collateralAmount) > 0)} onClick={() => void mutate({ action: "change_collateral", amount: -Number(collateralAmount), idempotencyKey: crypto.randomUUID() })}>{t("p2p.collateral.withdraw")}</button>
            </div>
            <small>{t("p2p.collateral.locked")}</small>
          </div>
        </details>

        <details className="p2p-form-card">
          <summary>{t("p2p.payment.add")}</summary>
          <div className="p2p-form-grid">
            <label className="finance-field"><span>{t("p2p.payment.label")}</span><input value={paymentForm.label} onChange={(event) => setPaymentForm({ ...paymentForm, label: event.target.value })} /></label>
            <label className="finance-field"><span>{t("p2p.payment.holder")}</span><input value={paymentForm.holderName} onChange={(event) => setPaymentForm({ ...paymentForm, holderName: event.target.value })} /></label>
            <label className="finance-field"><span>{t("p2p.payment.bank")}</span><input value={paymentForm.bankName} onChange={(event) => setPaymentForm({ ...paymentForm, bankName: event.target.value })} /></label>
            <label className="finance-field"><span>{t("p2p.payment.target")}</span><input value={paymentForm.paymentTarget} onChange={(event) => setPaymentForm({ ...paymentForm, paymentTarget: event.target.value })} /></label>
            <button className="challenge-primary-action" type="button" disabled={saving} onClick={() => void mutate({ action: "create_payment_method", ...paymentForm })}>{t("app.common.save")}</button>
          </div>
        </details>

        {data.paymentMethods.length ? <details className="p2p-form-card">
          <summary>{t("p2p.ad.create")}</summary>
          <div className="p2p-form-grid">
            <label className="finance-field"><span>{t("p2p.payment.method")}</span><select value={adForm.paymentMethodId} onChange={(event) => setAdForm({ ...adForm, paymentMethodId: event.target.value })}>{data.paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.label} · {method.masked_details}</option>)}</select></label>
            <label className="finance-field"><span>{t("p2p.amount.wallet")}</span><input inputMode="decimal" value={adForm.walletAmount} onChange={(event) => setAdForm({ ...adForm, walletAmount: event.target.value })} /></label>
            <label className="finance-field"><span>{t("p2p.rate")}</span><input inputMode="decimal" value={adForm.rubPerWallet} onChange={(event) => setAdForm({ ...adForm, rubPerWallet: event.target.value })} /></label>
            <label className="finance-field"><span>{t("p2p.minimum")}</span><input inputMode="decimal" value={adForm.minWalletAmount} onChange={(event) => setAdForm({ ...adForm, minWalletAmount: event.target.value })} /></label>
            <label className="finance-field"><span>{t("p2p.maximum")}</span><input inputMode="decimal" value={adForm.maxWalletAmount} onChange={(event) => setAdForm({ ...adForm, maxWalletAmount: event.target.value })} /></label>
            <label className="p2p-terms"><input type="checkbox" checked={sellerTermsAccepted} onChange={(event) => setSellerTermsAccepted(event.target.checked)} /><span>{t("p2p.coreRecoveryConsent")}</span></label>
            <button className="challenge-primary-action" type="button" disabled={saving || !data.tradingEnabled || !sellerTermsAccepted} onClick={() => void mutate({ action: "create_ad", paymentMethodId: adForm.paymentMethodId, walletAmount: Number(adForm.walletAmount), rubPerWallet: Number(adForm.rubPerWallet), minWalletAmount: Number(adForm.minWalletAmount), maxWalletAmount: Number(adForm.maxWalletAmount), acceptCoreRecovery: sellerTermsAccepted, idempotencyKey: crypto.randomUUID() })}>{t("p2p.ad.publish")}</button>
          </div>
        </details> : null}

        <div className="market-grid">
          {data.ads.filter((ad) => ad.seller_user_id !== user.id).map((ad) => <article className="market-card" key={ad.id}><div className="market-card-body"><strong>{money(ad.rub_per_wallet)} RUB / Wallet $</strong><span>{t("p2p.available", { amount: money(ad.available_amount) })}</span><small>{t("p2p.range", { min: money(ad.min_wallet_amount), max: money(ad.max_wallet_amount) })}</small><label className="finance-field"><span>{t("p2p.buy.amount")}</span><input inputMode="decimal" value={buyAmounts[ad.id] ?? String(ad.min_wallet_amount)} onChange={(event) => setBuyAmounts({ ...buyAmounts, [ad.id]: event.target.value })} /></label><label className="p2p-terms"><input type="checkbox" checked={buyerTermsAccepted[ad.id] ?? false} onChange={(event) => setBuyerTermsAccepted({ ...buyerTermsAccepted, [ad.id]: event.target.checked })} /><span>{t("p2p.coreRecoveryConsent")}</span></label><button className="challenge-primary-action" type="button" disabled={saving || !data.tradingEnabled || !buyerTermsAccepted[ad.id]} onClick={() => void mutate({ action: "create_order", adId: ad.id, walletAmount: Number(buyAmounts[ad.id] ?? ad.min_wallet_amount), acceptCoreRecovery: buyerTermsAccepted[ad.id], idempotencyKey: crypto.randomUUID() })}>{t("p2p.buy")}</button></div></article>)}
        </div>

        {data.orders.length ? <div className="market-deals"><strong>{t("p2p.orders")}</strong>{data.orders.map((order) => {
          const buyer = order.buyer_user_id === user.id;
          const details = revealedDetails[order.id];
          return <article className="market-card" key={order.id}><div className="market-card-body">
            <strong>{money(order.wallet_amount)} Wallet $ · {money(order.rub_amount)} RUB</strong>
            <span>{t("p2p.order.status", { status: order.status })}</span>
            {order.dispute ? <small>{t("p2p.dispute.status", { status: order.dispute.status })}</small> : null}
            {buyer && order.status === "awaiting_payment" ? <button className="text-button" type="button" onClick={() => void revealPaymentDetails(order.id)}>{t("p2p.payment.show")}</button> : null}
            {details ? <div className="p2p-payment-details"><strong>{details.bankName}</strong><span>{details.paymentTarget}</span><small>{details.holderName}</small></div> : null}
            <div className="market-card-actions">
              {buyer && order.status === "awaiting_payment" ? <button className="challenge-primary-action" disabled={saving} type="button" onClick={() => void mutate({ action: "mark_paid", orderId: order.id, idempotencyKey: crypto.randomUUID() })}>{t("p2p.order.paid")}</button> : null}
              {!buyer && ["payment_marked", "review_required"].includes(order.status) ? <button className="challenge-primary-action" disabled={saving} type="button" onClick={() => void mutate({ action: "confirm_received", orderId: order.id, idempotencyKey: crypto.randomUUID() })}>{t("p2p.order.received")}</button> : null}
              {buyer && order.status === "awaiting_payment" ? <button className="text-button danger" disabled={saving} type="button" onClick={() => void mutate({ action: "cancel", orderId: order.id, idempotencyKey: crypto.randomUUID() })}>{t("app.common.cancel")}</button> : null}
            </div>
            {((!order.dispute && ["payment_marked", "review_required", "released", "settled"].includes(order.status)) || order.dispute?.status === "resolved") ? <div className="p2p-dispute-row">
              <input placeholder={t("p2p.dispute.reason")} value={disputeReasons[order.id] ?? ""} onChange={(event) => setDisputeReasons({ ...disputeReasons, [order.id]: event.target.value })} />
              <button className="text-button danger" disabled={saving || !(disputeReasons[order.id]?.trim())} type="button" onClick={() => void mutate({ action: order.dispute ? "appeal" : "open_dispute", orderId: order.id, reason: disputeReasons[order.id], idempotencyKey: crypto.randomUUID() })}>{t(order.dispute ? "p2p.dispute.appeal" : "p2p.dispute.open")}</button>
            </div> : null}
          </div></article>;
        })}</div> : null}
      </> : null}
    </section>
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

async function getAccessToken(): Promise<string> {
  const supabase = getBrowserSupabaseClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}
