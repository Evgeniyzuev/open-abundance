"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import type { Tables } from "@/lib/database.types";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { parseTonUsdtUnits, tonUsdtUnitsToDecimal } from "@/lib/tonUsdtAmount";

type WalletRow = Tables<"wallet_accounts">;
type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;
type DepositInvoice = { id: string; invoice_code: string; comment: string; deposit_owner_address: string; deposit_jetton_wallet_address: string; master_address: string; expected_amount_units: string | null; network: string; asset_code: string; status: string; transferLink: string };
type DepositEvent = { transaction_hash: string; amount_units: string; status: string; settled_usd_amount: string | null; usdt_usd_rate: string | null; rejection_reason: string | null };
type WithdrawalQuote = { network: string; assetCode: "USDT"; masterAddress: string; serviceFeePercent: string; networkFeeReserveTon: string; minAmountUsdt: string; maxAmountUsdt: string; usdtUsdRate: string; tonUsdRate: string; networkFeeReserveAmount?: string };
type Withdrawal = { id: string; status: string; network: string; destination_address: string; amount_usdt: string | null; amount_units: string | null; payout_wallet_amount: string | null; service_fee_percent: string | null; service_fee_amount: string | null; network_fee_reserve_amount: string | null; total_reserved_amount: string | null; message_hash: string | null; error_message: string | null };

export function TonUsdtDepositModal({ locale, t, onClose, onRefresh }: { locale: AppLocale; t: TFunction; onClose: () => void; onRefresh: () => Promise<void> }) {
  const [invoice, setInvoice] = useState<DepositInvoice | null>(null);
  const [event, setEvent] = useState<DepositEvent | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const activeId = invoice?.id;
  const activeStatus = invoice?.status;

  useEffect(() => {
    let mounted = true;
    void loadJson< { invoice?: DepositInvoice | null; event?: DepositEvent | null; error?: string }>("/api/wallet/deposits/usdt?active=true").then((payload) => {
      if (mounted) { setInvoice(payload.invoice ?? null); setEvent(payload.event ?? null); }
    }).catch((loadError) => { if (mounted) setError(loadError instanceof Error ? loadError.message : t("wallet.usdt.deposit.error.load")); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [t]);

  useEffect(() => {
    if (!activeId || !activeStatus || !["waiting", "detected", "finalizing", "confirmed_pending_credit", "awaiting_rate"].includes(activeStatus)) return;
    let mounted = true;
    const interval = window.setInterval(() => {
      void loadJson<{ invoice?: DepositInvoice; event?: DepositEvent | null }>(`/api/wallet/deposits/usdt/${activeId}?ts=${Date.now()}`).then((payload) => {
        if (!mounted || !payload.invoice) return;
        setInvoice(payload.invoice); setEvent(payload.events?.[0] ?? payload.event ?? null);
        if (["credited", "credited_late", "credited_amount_mismatch"].includes(payload.invoice.status)) void onRefresh();
      }).catch(() => undefined);
    }, 15_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [activeId, activeStatus, onRefresh]);

  async function createInvoice() {
    if (amount.trim() && !parseTonUsdtUnits(amount, 6)) { setError(t("wallet.usdt.deposit.error.amount")); return; }
    setSaving(true); setError(null);
    try {
      const payload = await loadJson<{ invoice?: DepositInvoice; error?: string }>("/api/wallet/deposits/usdt", { method: "POST", body: JSON.stringify({ expectedAmountUsdt: amount.trim() || null }) });
      if (!payload.invoice) throw new Error(payload.error ?? t("wallet.usdt.deposit.error.create"));
      setInvoice(payload.invoice); setAmount("");
    } catch (createError) { setError(createError instanceof Error ? createError.message : t("wallet.usdt.deposit.error.create")); } finally { setSaving(false); }
  }
  async function copy(value: string, key: string) { try { await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied((current) => current === key ? null : current), 1600); } catch { setError(t("wallet.usdt.deposit.error.copy")); } }
  function reset() { setInvoice(null); setEvent(null); setAmount(""); setError(null); }

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <section className="modal-sheet small" role="dialog" aria-modal="true" aria-label={t("wallet.usdt.deposit.title")} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button><h2>{t("wallet.usdt.deposit.title")}</h2><span /></div>
      {loading ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
      {error ? <p className="topup-error">{error}</p> : null}
      {!loading && !invoice ? <div className="ton-deposit-form">
        <div className="ton-deposit-asset-grid"><article className="ton-deposit-asset-card active"><div><strong>USDT</strong><span>Tether USD · TON</span></div><p>{t("wallet.usdt.deposit.networkNotice")}</p><small>{t("wallet.usdt.deposit.decimals")}</small></article></div>
        <label className="finance-field"><span>{t("wallet.usdt.deposit.amount")}</span><input inputMode="decimal" value={amount} onChange={(input) => { setAmount(input.target.value); setError(null); }} placeholder="Например, 10" /></label>
        <div className="topup-modal-actions"><button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button><button className="challenge-primary-action" type="button" disabled={saving} onClick={() => void createInvoice()}>{saving ? t("app.common.loading") : t("wallet.usdt.deposit.create")}</button></div>
      </div> : null}
      {invoice ? <div className="ton-deposit-body">
        <div className="ton-deposit-qr"><QRCodeSVG value={invoice.transferLink} size={184} includeMargin /></div>
        <p className="transfer-summary">{t("wallet.usdt.deposit.instructions")}</p>
        <ValueRow label={t("wallet.usdt.deposit.network")} value={`${invoice.asset_code} · ${invoice.network}`} />
        <ValueRow label={t("wallet.usdt.deposit.address")} value={invoice.deposit_owner_address} onCopy={() => void copy(invoice.deposit_owner_address, "address")} copied={copied === "address"} t={t} />
        <ValueRow label={t("wallet.usdt.deposit.jettonWallet")} value={invoice.deposit_jetton_wallet_address} onCopy={() => void copy(invoice.deposit_jetton_wallet_address, "jetton")} copied={copied === "jetton"} t={t} />
        <ValueRow label={t("wallet.usdt.deposit.master")} value={invoice.master_address} onCopy={() => void copy(invoice.master_address, "master")} copied={copied === "master"} t={t} />
        <ValueRow label={t("wallet.usdt.deposit.comment")} value={invoice.comment} onCopy={() => void copy(invoice.comment, "comment")} copied={copied === "comment"} t={t} />
        {invoice.expected_amount_units ? <ValueRow label={t("wallet.usdt.deposit.expectedAmount")} value={`${tonUsdtUnitsToDecimal(invoice.expected_amount_units)} USDT`} /> : null}
        <div className="ton-deposit-status"><span>{t("wallet.usdt.deposit.status")}</span><strong>{usdtDepositStatus(invoice.status, t)}</strong></div>
        <p className="transfer-muted">{t("wallet.usdt.deposit.averageCreditTime")}</p>
        {event && ["credited", "credited_late", "credited_amount_mismatch"].includes(invoice.status) ? <div className={`ton-deposit-check-result status-${invoice.status}`}><strong>{event.settled_usd_amount ? t("wallet.usdt.deposit.creditedAmount", { amount: formatUsd(event.settled_usd_amount, locale) }) : t("wallet.usdt.deposit.credited")}</strong><p>{tonUsdtUnitsToDecimal(event.amount_units)} USDT · {event.transaction_hash.slice(0, 8)}…</p></div> : null}
        {!["waiting", "detected", "finalizing", "confirmed_pending_credit", "awaiting_rate"].includes(invoice.status) ? <button className="challenge-primary-action" type="button" onClick={reset}>{t("wallet.usdt.deposit.new")}</button> : null}
      </div> : null}
    </section>
  </div>;
}

export function TonUsdtWithdrawalModal({ locale, t, wallet, onClose, onSuccess }: { locale: AppLocale; t: TFunction; wallet: WalletRow; onClose: () => void; onSuccess: (wallet: WalletRow) => Promise<void> }) {
  const [quote, setQuote] = useState<WithdrawalQuote | null>(null);
  const [withdrawal, setWithdrawal] = useState<Withdrawal | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadJson<{ enabled?: boolean; quote?: WithdrawalQuote; error?: string; reason?: string; diagnostics?: { mnemonicWordCount?: number } }>("/api/wallet/withdrawals/usdt")
      .then((payload) => {
        if (!mounted) return;
        if (payload.quote) setQuote(payload.quote);
        if (payload.enabled) setEnabled(true);
        else setError(payload.error ?? usdtWithdrawalAvailabilityError(payload.reason, payload.diagnostics, t));
      })
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : t("wallet.usdt.withdraw.error.quote"));
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [t]);

  const parsedAmount = Number(amount.replace(",", "."));
  const payout = quote && Number.isFinite(parsedAmount) ? parsedAmount * Number(quote.usdtUsdRate) : 0;
  const service = quote ? payout * Number(quote.serviceFeePercent) / 100 : 0;
  const network = Number(quote?.networkFeeReserveAmount ?? 0);
  const total = payout + service + network;
  const amountValid = Boolean(quote && Number.isFinite(parsedAmount) && parsedAmount >= Number(quote.minAmountUsdt) && parsedAmount <= Number(quote.maxAmountUsdt));
  const balanceValid = total <= wallet.balance;

  async function createWithdrawal() {
    if (!enabled || !amountValid || !destination.trim() || !balanceValid) return;
    setSaving(true); setError(null);
    try {
      const payload = await loadJson<{ withdrawal?: Withdrawal; wallet?: WalletRow; error?: string }>("/api/wallet/withdrawals/usdt", { method: "POST", body: JSON.stringify({ amountUsdt: amount.replace(",", "."), destinationAddress: destination.trim(), idempotencyKey: crypto.randomUUID() }) });
      if (!payload.withdrawal) throw new Error(payload.error ?? t("wallet.usdt.withdraw.error.create"));
      setWithdrawal(payload.withdrawal); if (payload.wallet) await onSuccess(payload.wallet);
    } catch (createError) { setError(createError instanceof Error ? createError.message : t("wallet.usdt.withdraw.error.create")); } finally { setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation" onClick={onClose}><section className="modal-sheet small" role="dialog" aria-modal="true" aria-label={t("wallet.usdt.withdraw.title")} onClick={(event) => event.stopPropagation()}>
    <div className="modal-header"><button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button><h2>{t("wallet.usdt.withdraw.title")}</h2><span /></div>
    {loading ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
    {!loading && !withdrawal && quote ? <div className="ton-withdraw-body">
      <div className="topup-balance-info"><div className="topup-balance-card"><span>{t("wallet.availableBalance")}</span><strong className="wallet-color">{formatUsd(String(wallet.balance), locale)}</strong></div><div className="topup-balance-card"><span>{t("wallet.usdt.withdraw.rate")}</span><strong>{formatUsd(quote.usdtUsdRate, locale)} / USDT</strong></div></div>
      {!enabled ? <p className="topup-error">{error ?? t("wallet.usdt.withdraw.unavailable.setup")}</p> : <>
        <label className="finance-field"><span>{t("wallet.usdt.withdraw.amount")}</span><input inputMode="decimal" value={amount} onChange={(input) => { setAmount(input.target.value); setError(null); }} placeholder="Например, 10" /></label>
        <label className="finance-field"><span>{t("wallet.usdt.withdraw.address")}</span><input value={destination} onChange={(input) => { setDestination(input.target.value); setError(null); }} placeholder="TON-адрес" autoComplete="off" /></label>
        <div className="ton-withdraw-fees"><div><span>{t("wallet.usdt.withdraw.payout")}</span><strong>{formatUsd(String(payout), locale)}</strong></div><div><span>{t("wallet.usdt.withdraw.serviceFee", { percent: quote.serviceFeePercent })}</span><strong>{formatUsd(String(service), locale)}</strong></div><div><span>{t("wallet.usdt.withdraw.networkFee")}</span><strong>{formatUsd(String(network), locale)}</strong></div><div className="ton-withdraw-total"><span>{t("wallet.usdt.withdraw.total")}</span><strong>{formatUsd(String(total), locale)}</strong></div></div>
        {!amountValid && amount ? <p className="topup-error">{t("wallet.usdt.withdraw.error.amountRange", { min: quote.minAmountUsdt, max: quote.maxAmountUsdt })}</p> : null}{amountValid && !balanceValid ? <p className="topup-error">{t("wallet.usdt.withdraw.error.insufficient")}</p> : null}
        <div className="topup-modal-actions"><button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button><button className="challenge-primary-action" type="button" disabled={!amountValid || !destination.trim() || !balanceValid || saving} onClick={() => void createWithdrawal()}>{saving ? t("app.common.loading") : t("wallet.usdt.withdraw.confirm")}</button></div>
      </>}
    </div> : null}
    {!loading && !quote && !withdrawal && error ? <p className="topup-error">{error}</p> : null}
    {withdrawal ? <div className="ton-withdraw-body"><div className="ton-deposit-status"><span>{t("wallet.usdt.withdraw.status")}</span><strong>{usdtWithdrawalStatus(withdrawal.status, t)}</strong></div><ValueRow label={t("wallet.usdt.withdraw.amount")} value={`${withdrawal.amount_usdt ?? "—"} USDT`} /><ValueRow label={t("wallet.usdt.withdraw.address")} value={withdrawal.destination_address} />{withdrawal.message_hash ? <p className="transfer-muted">{withdrawal.message_hash}</p> : null}{withdrawal.error_message ? <p className="topup-error">{withdrawal.error_message}</p> : null}<button className="challenge-primary-action" type="button" onClick={onClose}>{t("app.common.done")}</button></div> : null}
  </section></div>;
}

function usdtWithdrawalAvailabilityError(reason: string | undefined, diagnostics: { mnemonicWordCount?: number } | undefined, t: TFunction): string {
  if (reason === "disabled") return t("wallet.usdt.withdraw.unavailable.railDisabled");
  if (reason === "owner_missing") return t("wallet.usdt.withdraw.unavailable.ownerMissing");
  if (reason === "master_invalid") return t("wallet.usdt.withdraw.unavailable.masterInvalid");
  if (reason === "jetton_wallet_missing") return t("wallet.usdt.withdraw.unavailable.jettonWalletMissing");
  if (reason === "withdrawal_disabled") return t("wallet.usdt.withdraw.unavailable.disabled");
  if (reason === "mnemonic_missing") return t("wallet.usdt.withdraw.unavailable.mnemonicMissing");
  if (reason === "mnemonic_invalid") return t("wallet.usdt.withdraw.unavailable.mnemonicInvalid", { count: diagnostics?.mnemonicWordCount ?? 0 });
  return t("wallet.usdt.withdraw.unavailable.setup");
}function ValueRow({ label, value, onCopy, copied, t }: { label: string; value: string; onCopy?: () => void; copied?: boolean; t?: TFunction }) { return <div className="ton-deposit-field"><span>{label}</span><code>{value}</code>{onCopy && t ? <button className="text-button" type="button" onClick={onCopy}>{copied ? t("wallet.usdt.deposit.copied") : t("wallet.usdt.deposit.copy")}</button> : null}</div>; }
async function loadJson<T>(path: string, options?: { method?: string; body?: string }): Promise<T & { error?: string; events?: DepositEvent[] }> { const token = await getAccessToken(); const response = await fetch(`${path}${path.includes("?") ? "&" : "?"}ts=${Date.now()}`, { method: options?.method ?? "GET", cache: "no-store", headers: { Authorization: `Bearer ${token}`, ...(options?.body ? { "Content-Type": "application/json" } : {}) }, body: options?.body }); const payload = (await response.json().catch(() => ({}))) as T & { error?: string }; if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed."); return payload; }
async function getAccessToken(): Promise<string> { const supabase = getBrowserSupabaseClient(); const { data: { session }, error } = await supabase.auth.getSession(); if (error) throw error; if (!session?.access_token) throw new Error("Supabase session is missing."); return session.access_token; }
function formatUsd(value: string, locale: AppLocale): string { const number = Number(value); return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number.isFinite(number) ? number : 0)} USD`; }
function usdtDepositStatus(status: string, t: TFunction): string { const key = `wallet.usdt.deposit.status.${status}` as MessageKey; return t(key); }
function usdtWithdrawalStatus(status: string, t: TFunction): string { const key = `wallet.usdt.withdraw.status.${status}` as MessageKey; return t(key); }