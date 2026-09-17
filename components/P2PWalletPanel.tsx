"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

type PaymentMethod = { id: string; method_type: string; label: string; masked_details: string; is_reusable?: boolean };
type Ad = { id: string; seller_user_id: string; direction: "buy" | "sell"; available_amount: number; rub_per_wallet: number; min_wallet_amount: number; max_wallet_amount: number; status: string; payment_method?: { label?: string; masked_details?: string } | null };
type Order = { id: string; buyer_user_id: string; seller_user_id: string; ad_owner_user_id?: string; requester_user_id?: string; direction?: "buy" | "sell"; wallet_amount: number; rub_amount: number; status: string; payment_due_at: string; accept_due_at?: string | null; receipt_confirmation_due_at?: string | null; coverage_until?: string | null; dispute?: { status: string; resolution?: string | null } | null };
type P2PData = { tradingEnabled: boolean; paymentDetailsEncryptionConfigured: boolean; member: { status: string }; limit: { availableAmount: number; outstandingRisk: number; coreSecurity: number; trustFactor: number; trustEnforced: boolean; maturedCounterparties: number }; collateral: { amount: number; reserved_amount: number }; paymentMethods: PaymentMethod[]; ads: Ad[]; myAds: Ad[]; orders: Order[]; fund: { availableAmount: number; verifiedAt: string | null } | null };
type Details = { methodType: "sbp" | "bank_transfer"; label: string; holderName: string; paymentTarget: string; bankName: string };
const emptyDetails: Details = { methodType: "sbp", label: "", holderName: "", paymentTarget: "", bankName: "" };

export default function P2PWalletPanel({ active }: { active: boolean }) {
  const { t, user } = useUserContext();
  const [data, setData] = useState<P2PData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<"buy" | "sell" | "ads" | "orders">("buy");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [collateralAmount, setCollateralAmount] = useState("");
  const [adForm, setAdForm] = useState({ direction: "sell" as "buy" | "sell", walletAmount: "100", rubPerWallet: "100", minWalletAmount: "10", maxWalletAmount: "100", paymentMethodId: "" });
  const [adDetails, setAdDetails] = useState<Details>(emptyDetails);
  const [adSaveDetails, setAdSaveDetails] = useState(false);
  const [requestAmounts, setRequestAmounts] = useState<Record<string, string>>({});
  const [requestDetails, setRequestDetails] = useState<Record<string, Details>>({});
  const [requestSaveDetails, setRequestSaveDetails] = useState<Record<string, boolean>>({});
  const [terms, setTerms] = useState<Record<string, boolean>>({});
  const [deal, setDeal] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState("");
  const [messageFile, setMessageFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/p2p?ts=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${await getAccessToken()}` } });
      const payload = await response.json() as P2PData & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load P2P.");
      setData(payload);
      setAdForm((current) => ({ ...current, paymentMethodId: current.paymentMethodId || payload.paymentMethods[0]?.id || "" }));
      if (!selectedOrder) { const fromUrl = new URLSearchParams(window.location.search).get("order"); if (fromUrl && payload.orders.some((order) => order.id === fromUrl)) setSelectedOrder(fromUrl); }
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Failed to load P2P."); }
    finally { setLoading(false); }
  }, [selectedOrder, user]);

  useEffect(() => { if (active) void load(); }, [active, load]);
  useEffect(() => { setData(null); setSelectedOrder(null); setDeal(null); }, [user?.id]);
  useEffect(() => { if (selectedOrder && data) void loadDeal(selectedOrder); }, [selectedOrder, data]);

  async function mutate(body: Record<string, unknown>) {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/p2p", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getAccessToken()}` }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string; code?: string };
      if (!response.ok || payload.error) { if (payload.code === "P2P_PAYMENT_DETAILS_NOT_CONFIGURED") throw new Error(t("p2p.payment.notConfigured")); throw new Error(payload.error ?? "P2P action failed."); }
      await load();
      if (body.orderId && typeof body.orderId === "string") await loadDeal(body.orderId);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "P2P action failed."); }
    finally { setSaving(false); }
  }

  async function loadDeal(orderId: string) {
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/p2p/orders/${orderId}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json(); if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load the deal.");
      setDeal(payload);
      const messagesResponse = await fetch(`/api/p2p/orders/${orderId}/messages`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      if (messagesResponse.ok) setMessages((await messagesResponse.json()).messages ?? []);
    } catch (dealError) { setError(dealError instanceof Error ? dealError.message : "Failed to load the deal."); }
  }

  async function sendMessage() {
    if (!selectedOrder || (!messageText.trim() && !messageFile)) return;
    setSaving(true); setError(null);
    try {
      const form = new FormData(); if (messageText.trim()) form.set("body", messageText.trim()); if (messageFile) form.set("file", messageFile);
      const response = await fetch(`/api/p2p/orders/${selectedOrder}/messages`, { method: "POST", headers: { Authorization: `Bearer ${await getAccessToken()}` }, body: form });
      const payload = await response.json(); if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to send message.");
      setMessageText(""); setMessageFile(null); await loadDeal(selectedOrder);
    } catch (messageError) { setError(messageError instanceof Error ? messageError.message : "Failed to send message."); }
    finally { setSaving(false); }
  }

  if (!user) return null;
  if (loading && !data) return <section className="market-panel p2p-panel"><p className="finance-error neutral">{t("app.common.loading")}</p></section>;
  if (!data) return <section className="market-panel p2p-panel">{error ? <p className="finance-error">{error}</p> : null}</section>;
  const memberActive = !["suspended", "revoked"].includes(data.member.status);
  const visibleAds = data.ads.filter((ad) => section === "buy" ? ad.direction === "sell" && ad.seller_user_id !== user.id : ad.direction === "buy" && ad.seller_user_id !== user.id);
  const openDeal = (orderId: string) => { setSelectedOrder(orderId); window.history.replaceState({}, "", `/?view=wallet.p2p&order=${orderId}`); };

  return <section className="market-panel p2p-panel">
    <div className="market-head"><div><span>{t("p2p.kicker")}</span><strong>{t("p2p.title")}</strong><small>{t("p2p.closedPilot")}</small></div><button className="text-button" type="button" onClick={() => void load()}>{t("app.common.refresh")}</button></div>
    {error ? <p className="finance-error" role="alert">{error}</p> : null}
    {!memberActive ? <div className="finance-state"><strong>{t("p2p.access.title")}</strong><p>{t("p2p.access.description")}</p></div> : null}
    {memberActive ? <>
      {!data.tradingEnabled ? <p className="finance-error neutral">{t("p2p.tradingPaused")}</p> : null}
      {!data.paymentDetailsEncryptionConfigured ? <p className="finance-error neutral">{t("p2p.payment.notConfigured")}</p> : null}
      <div className="p2p-metrics"><article><span>{t("p2p.limit.available")}</span><strong>{money(data.limit.availableAmount)} Wallet $</strong></article><article><span>{t("p2p.fund.available")}</span><strong>{money(data.fund?.availableAmount ?? 0)} Wallet $</strong></article><article><span>{t("p2p.limit.core")}</span><strong>{money(data.limit.coreSecurity)} Wallet $</strong></article><article><span>{t("p2p.collateral.balance")}</span><strong>{money(data.collateral.amount)} Wallet $</strong></article></div>
      <small className="p2p-policy-note">{t(data.limit.trustEnforced ? "p2p.trust.enforced" : "p2p.trust.shadow", { factor: data.limit.trustFactor, count: data.limit.maturedCounterparties })}</small>
      <nav className="p2p-tabs" aria-label={t("p2p.market.filters")}><button className={section === "buy" ? "active" : ""} type="button" onClick={() => { setSection("buy"); setSelectedOrder(null); }}>{t("p2p.market.buy")}</button><button className={section === "sell" ? "active" : ""} type="button" onClick={() => { setSection("sell"); setSelectedOrder(null); }}>{t("p2p.market.sell")}</button><button className={section === "ads" ? "active" : ""} type="button" onClick={() => { setSection("ads"); setSelectedOrder(null); }}>{t("p2p.market.myAds")}</button><button className={section === "orders" ? "active" : ""} type="button" onClick={() => { setSection("orders"); setSelectedOrder(null); }}>{t("p2p.market.myOrders")}</button></nav>
      {selectedOrder && deal ? <DealView deal={deal} messages={messages} userId={user.id} messageText={messageText} messageFile={messageFile} saving={saving} setMessageText={setMessageText} setMessageFile={setMessageFile} sendMessage={sendMessage} onBack={() => { setSelectedOrder(null); setDeal(null); window.history.replaceState({}, "", "?view=wallet.p2p"); }} onAction={(action: string) => void mutate({ action, orderId: selectedOrder, idempotencyKey: crypto.randomUUID() })} t={t} /> : section === "ads" ? <MyAds data={data} adForm={adForm} setAdForm={setAdForm} adDetails={adDetails} setAdDetails={setAdDetails} adSaveDetails={adSaveDetails} setAdSaveDetails={setAdSaveDetails} terms={terms} setTerms={setTerms} saving={saving} tradingEnabled={data.tradingEnabled} paymentReady={data.paymentDetailsEncryptionConfigured} paymentMethods={data.paymentMethods} onCreate={() => void createAd()} onAction={(action: string, adId: string) => void mutate({ action, adId, idempotencyKey: crypto.randomUUID() })} t={t} collateralAmount={collateralAmount} setCollateralAmount={setCollateralAmount} onCollateral={(amount: number) => void mutate({ action: "change_collateral", amount, idempotencyKey: crypto.randomUUID() })} /> : section === "orders" ? <Orders orders={data.orders} userId={user.id} saving={saving} onOpen={openDeal} onAction={(action: string, orderId: string) => void mutate({ action, orderId, idempotencyKey: crypto.randomUUID() })} t={t} /> : <MarketAds ads={visibleAds} section={section} requestAmounts={requestAmounts} setRequestAmounts={setRequestAmounts} requestDetails={requestDetails} setRequestDetails={setRequestDetails} requestSaveDetails={requestSaveDetails} setRequestSaveDetails={setRequestSaveDetails} terms={terms} setTerms={setTerms} saving={saving} tradingEnabled={data.tradingEnabled} paymentReady={data.paymentDetailsEncryptionConfigured} onRequest={(adId: string) => void createOrder(adId)} t={t} />}
    </> : null}
  </section>;

  async function createAd() { const complete = adDetails.label && adDetails.holderName && adDetails.paymentTarget && adDetails.bankName; await mutate({ action: "create_ad", direction: adForm.direction, paymentMethodId: adForm.direction === "sell" && !complete ? adForm.paymentMethodId : "", ...(adForm.direction === "sell" && complete ? { paymentDetails: adDetails, savePaymentDetails: adSaveDetails } : {}), walletAmount: Number(adForm.walletAmount), rubPerWallet: Number(adForm.rubPerWallet), minWalletAmount: Number(adForm.minWalletAmount), maxWalletAmount: Number(adForm.maxWalletAmount), acceptCoreRecovery: true, idempotencyKey: crypto.randomUUID() }); }
  async function createOrder(adId: string) { const details = requestDetails[adId] ?? emptyDetails; const complete = details.label && details.holderName && details.paymentTarget && details.bankName; await mutate({ action: "create_order", adId, walletAmount: Number(requestAmounts[adId]), ...(complete ? { paymentDetails: details, savePaymentDetails: requestSaveDetails[adId] } : {}), acceptCoreRecovery: true, idempotencyKey: crypto.randomUUID() }); }
}

function MarketAds(props: any) { const { t } = props; return <div className="market-grid">{props.ads.length ? props.ads.map((ad: Ad) => { const buy = props.section === "buy"; const details = props.requestDetails[ad.id] ?? emptyDetails; return <article className="market-card" key={ad.id}><div className="market-card-body"><strong>{money(ad.rub_per_wallet)} RUB / Wallet $</strong><span>{t("p2p.available", { amount: money(ad.available_amount) })}</span><small>{t("p2p.range", { min: money(ad.min_wallet_amount), max: money(ad.max_wallet_amount) })} · {ad.payment_method?.label ?? t("p2p.market.bank")}</small><label className="finance-field"><span>{buy ? t("p2p.buy.amount") : t("p2p.amount.wallet")}</span><input inputMode="decimal" value={props.requestAmounts[ad.id] ?? String(ad.min_wallet_amount)} onChange={(event) => props.setRequestAmounts({ ...props.requestAmounts, [ad.id]: event.target.value })} /></label>{!buy ? <PaymentFields details={details} setDetails={(next: Details) => props.setRequestDetails({ ...props.requestDetails, [ad.id]: next })} t={t} /> : null}<label className="p2p-terms"><input type="checkbox" checked={props.terms[ad.id] ?? false} onChange={(event) => props.setTerms({ ...props.terms, [ad.id]: event.target.checked })} /><span>{t("p2p.coreRecoveryConsent")}</span></label><button className="challenge-primary-action" type="button" disabled={props.saving || !props.tradingEnabled || !props.paymentReady || !props.terms[ad.id]} onClick={() => props.onRequest(ad.id)}>{t("p2p.request")}</button></div></article>; }) : <p className="finance-state">{t("p2p.market.noAds")}</p>}</div>; }

function MyAds(props: any) {
  const { t } = props;
  return <div>
    <details className="p2p-form-card" open><summary>{t(props.adForm.direction === "sell" ? "p2p.ad.create" : "p2p.ad.buyCreate")}</summary>
      <div className="p2p-form-grid">
        <label className="finance-field"><span>{t("p2p.market.buy")} / {t("p2p.market.sell")}</span><select value={props.adForm.direction} onChange={(event) => props.setAdForm({ ...props.adForm, direction: event.target.value })}><option value="sell">{t("p2p.market.sell")}</option><option value="buy">{t("p2p.market.buy")}</option></select></label>
        <label className="finance-field"><span>{t("p2p.amount.wallet")}</span><input inputMode="decimal" value={props.adForm.walletAmount} onChange={(event) => props.setAdForm({ ...props.adForm, walletAmount: event.target.value })} /></label>
        <label className="finance-field"><span>{t("p2p.rate")}</span><input inputMode="decimal" value={props.adForm.rubPerWallet} onChange={(event) => props.setAdForm({ ...props.adForm, rubPerWallet: event.target.value })} /></label>
        <label className="finance-field"><span>{t("p2p.minimum")}</span><input inputMode="decimal" value={props.adForm.minWalletAmount} onChange={(event) => props.setAdForm({ ...props.adForm, minWalletAmount: event.target.value })} /></label>
        <label className="finance-field"><span>{t("p2p.maximum")}</span><input inputMode="decimal" value={props.adForm.maxWalletAmount} onChange={(event) => props.setAdForm({ ...props.adForm, maxWalletAmount: event.target.value })} /></label>
        {props.adForm.direction === "sell" ? <><PaymentFields details={props.adDetails} setDetails={props.setAdDetails} t={t} /><label className="p2p-terms"><input type="checkbox" checked={props.adSaveDetails} onChange={(event) => props.setAdSaveDetails(event.target.checked)} /><span>{t("p2p.payment.saveOptional")}</span></label></> : null}
        <label className="p2p-terms"><input type="checkbox" checked={props.terms.ad ?? false} onChange={(event) => props.setTerms({ ...props.terms, ad: event.target.checked })} /><span>{t("p2p.coreRecoveryConsent")}</span></label>
        <button className="challenge-primary-action" type="button" disabled={props.saving || !props.tradingEnabled || (props.adForm.direction === "sell" && !props.paymentReady) || !props.terms.ad} onClick={props.onCreate}>{t("p2p.ad.publish")}</button>
      </div>
    </details>
    <details className="p2p-form-card"><summary>{t("p2p.collateral.title")}</summary><div className="p2p-form-grid"><label className="finance-field"><span>{t("p2p.amount.wallet")}</span><input inputMode="decimal" value={props.collateralAmount} onChange={(event) => props.setCollateralAmount(event.target.value)} /></label><div className="market-card-actions"><button className="challenge-primary-action" type="button" disabled={props.saving || !(Number(props.collateralAmount) > 0)} onClick={() => props.onCollateral(Number(props.collateralAmount))}>{t("p2p.collateral.add")}</button><button className="text-button" type="button" disabled={props.saving || !(Number(props.collateralAmount) > 0)} onClick={() => props.onCollateral(-Number(props.collateralAmount))}>{t("p2p.collateral.withdraw")}</button></div><small>{t("p2p.collateral.locked")}</small></div></details>
    <div className="market-grid">{props.data.myAds.map((ad: Ad) => <article className="market-card" key={ad.id}><div className="market-card-body"><strong>{ad.direction === "sell" ? t("p2p.market.sell") : t("p2p.market.buy")} · {money(ad.rub_per_wallet)} RUB</strong><span>{t("p2p.available", { amount: money(ad.available_amount) })}</span><small>{t("p2p.order.status", { status: ad.status })}</small><div className="market-card-actions">{ad.status === "active" ? <button className="text-button" type="button" onClick={() => props.onAction("set_ad_status", ad.id)}>{t("p2p.ad.pause")}</button> : ad.status === "paused" ? <button className="text-button" type="button" onClick={() => props.onAction("set_ad_status", ad.id)}>{t("p2p.ad.resume")}</button> : null}<button className="text-button danger" type="button" onClick={() => props.onAction("cancel_ad", ad.id)}>{t("p2p.ad.cancel")}</button></div></div></article>)}</div>
  </div>;
}

function Orders(props: any) { const { t } = props; return <div className="market-deals"><strong>{t("p2p.orders")}</strong>{props.orders.length ? props.orders.map((order: Order) => <article className="market-card" key={order.id}><div className="market-card-body"><strong>{money(order.wallet_amount)} Wallet $ · {money(order.rub_amount)} RUB</strong><span>{t("p2p.order.status", { status: order.status })}</span><div className="market-card-actions"><button className="challenge-primary-action" type="button" onClick={() => props.onOpen(order.id)}>{t("p2p.deal.open")}</button>{order.status === "pending_acceptance" && order.ad_owner_user_id === props.userId ? <><button className="text-button" disabled={props.saving} type="button" onClick={() => props.onAction("accept_order", order.id)}>{t("p2p.request.accept")}</button><button className="text-button danger" disabled={props.saving} type="button" onClick={() => props.onAction("reject_order", order.id)}>{t("p2p.request.reject")}</button></> : null}</div></div></article>) : <p className="finance-state">{t("p2p.market.noAds")}</p>}</div>; }

function DealView(props: any) {
  const { t, deal } = props;
  const order: Order = deal.order;
  const actions: string[] = deal.allowedActions ?? [];
  const [details, setDetails] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!["awaiting_payment", "payment_marked", "review_required", "disputed"].includes(order.status)) return;
    void (async () => {
      const response = await fetch(`/api/p2p/orders/${order.id}/payment-details`, { cache: "no-store", headers: { Authorization: `Bearer ${await getAccessToken()}` } });
      if (response.ok) setDetails((await response.json()).details ?? null);
    })();
  }, [order.id, order.status]);
  return <div className="p2p-deal-view"><button className="text-button" type="button" onClick={props.onBack}>← {t("p2p.market.myOrders")}</button><h3>{t("p2p.deal.open")}</h3><div className="p2p-form-card"><strong>{money(order.wallet_amount)} Wallet $ · {money(order.rub_amount)} RUB</strong><p>{t("p2p.order.status", { status: order.status })}</p><small>{order.status === "pending_acceptance" ? t("p2p.deal.acceptHint") : t("p2p.deal.payHint")}</small>{details ? <div className="p2p-payment-details"><strong>{details.bankName}</strong><span>{details.paymentTarget}</span><small>{details.holderName}</small></div> : null}<div className="market-card-actions">{actions.includes("accept_order") ? <button className="challenge-primary-action" type="button" onClick={() => props.onAction("accept_order")}>{t("p2p.request.accept")}</button> : null}{actions.includes("reject_order") ? <button className="text-button danger" type="button" onClick={() => props.onAction("reject_order")}>{t("p2p.request.reject")}</button> : null}{actions.includes("mark_paid") ? <button className="challenge-primary-action" type="button" onClick={() => props.onAction("mark_paid")}>{t("p2p.order.paid")}</button> : null}{actions.includes("confirm_received") ? <button className="challenge-primary-action" type="button" onClick={() => props.onAction("confirm_received")}>{t("p2p.order.received")}</button> : null}{actions.includes("cancel") ? <button className="text-button danger" type="button" onClick={() => props.onAction("cancel")}>{t("p2p.request.cancel")}</button> : null}</div></div><div className="p2p-form-card"><strong>{t("p2p.deal.chat")}</strong><div className="p2p-chat-log">{props.messages.map((message: any) => <p key={message.id}><small>{message.sender_user_id === props.userId ? t("p2p.chat.you") : t("p2p.chat.counterparty")}</small><span>{message.body}</span>{message.attachmentUrl ? <a href={message.attachmentUrl} target="_blank" rel="noreferrer">{message.attachment_name ?? t("p2p.deal.attach")}</a> : null}</p>)}</div><textarea value={props.messageText} onChange={(event) => props.setMessageText(event.target.value)} placeholder={t("p2p.deal.message")} /><div className="market-card-actions"><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => props.setMessageFile(event.target.files?.[0] ?? null)} /><button className="challenge-primary-action" disabled={props.saving} type="button" onClick={props.sendMessage}>{t("p2p.deal.send")}</button></div></div></div>;
}

function PaymentFields({ details, setDetails, t }: { details: Details; setDetails: (details: Details) => void; t: (key: string, vars?: Record<string, string | number>) => string }) { return <div className="p2p-form-grid"><label className="finance-field"><span>{t("p2p.payment.method")}</span><select value={details.methodType} onChange={(event) => setDetails({ ...details, methodType: event.target.value as Details["methodType"] })}><option value="sbp">{t("p2p.payment.sbp")}</option><option value="bank_transfer">{t("p2p.market.bank")}</option></select></label><label className="finance-field"><span>{t("p2p.payment.label")}</span><input value={details.label} onChange={(event) => setDetails({ ...details, label: event.target.value })} /></label><label className="finance-field"><span>{t("p2p.payment.holder")}</span><input value={details.holderName} onChange={(event) => setDetails({ ...details, holderName: event.target.value })} /></label><label className="finance-field"><span>{t("p2p.payment.bank")}</span><input value={details.bankName} onChange={(event) => setDetails({ ...details, bankName: event.target.value })} /></label><label className="finance-field"><span>{t("p2p.payment.target")}</span><input value={details.paymentTarget} onChange={(event) => setDetails({ ...details, paymentTarget: event.target.value })} /></label></div>; }

function money(value: number): string { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value) || 0); }
async function getAccessToken(): Promise<string> { const supabase = getBrowserSupabaseClient(); const { data: { session }, error } = await supabase.auth.getSession(); if (error) throw error; if (!session?.access_token) throw new Error("Supabase session is missing."); return session.access_token; }
