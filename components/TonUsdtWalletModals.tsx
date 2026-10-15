"use client";

import Sheet from "@/components/ui/Sheet";
import QrScanButton from "@/components/QrScanner";
import { parseScanned } from "@/lib/qrPayload";
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import type { Tables } from "@/lib/database.types";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { parseTonUsdtUnits, tonUsdtUnitsToDecimal } from "@/lib/tonUsdtAmount";
import { formatRateMoney } from "@/lib/moneyFormat";
import { startVisiblePolling } from "@/lib/visiblePolling";

type WalletRow = Tables<"wallet_accounts">;
type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;
type DepositInvoice = { id: string; invoice_code: string; comment: string; deposit_owner_address: string; deposit_jetton_wallet_address: string; master_address: string; expected_amount_units: string | null; network: string; asset_code: string; status: string; transferLink: string; amount_window_started_at?: string | null };
type DepositEvent = { transaction_hash: string; amount_units: string; status: string; settled_usd_amount: string | null; usdt_usd_rate: string | null; rejection_reason: string | null };
type WithdrawalQuote = { network: string; assetCode: "USDT"; masterAddress: string; serviceFeePercent: string; networkFeeReserveTon: string; minAmountUsdt: string; maxAmountUsdt: string; usdtUsdRate: string; tonUsdRate: string; networkFeeReserveAmount?: string };
type Withdrawal = { id: string; status: string; network: string; destination_address: string; amount_usdt: string | null; amount_units: string | null; payout_wallet_amount: string | null; service_fee_percent: string | null; service_fee_amount: string | null; network_fee_reserve_amount: string | null; total_reserved_amount: string | null; message_hash: string | null; error_message: string | null };

type DepositPayload = {
  invoice?: DepositInvoice | null;
  event?: DepositEvent | null;
  boundSenders?: Array<{ address: string; createdAt: string }>;
  depositAddress?: string | null;
  boundTransferLink?: string | null;
  bindingResult?: string | null;
  error?: string;
};

const AMOUNT_WINDOW_MS = 10 * 60_000;
const IN_PROGRESS_STATUSES = ["waiting", "detected", "finalizing", "confirmed_pending_credit", "awaiting_rate"];
const CREDITED_STATUSES = ["credited", "credited_late", "credited_amount_mismatch"];
const BIND_NOTE_RESULTS = ["busy", "taken", "unknown", "error", "invalid"];

export function TonUsdtDepositModal({ locale, t, onClose, onRefresh }: { locale: AppLocale; t: TFunction; onClose: () => void; onRefresh: () => Promise<void> }) {
  const [data, setData] = useState<DepositPayload | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const autoCreated = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<"auto" | "bound" | "bind">("auto");

  const invoice = data?.invoice ?? null;
  const bound = data?.boundSenders ?? [];
  const inProgress = Boolean(invoice && IN_PROGRESS_STATUSES.includes(invoice.status));
  const creditedNow = Boolean(invoice && CREDITED_STATUSES.includes(invoice.status));
  // Credited, but the binding check has not finished yet.
  const bindingPending = creditedNow && bound.length === 0 && !data?.bindingResult;

  const load = useCallback(async () => {
    const payload = await loadJson<DepositPayload>(`/api/wallet/deposits/usdt?active=true&ts=${Date.now()}`);
    setData(payload);
    return payload;
  }, []);

  const createInvoice = useCallback(async (refreshAmount = false) => {
    setCreating(true); setError(null);
    try {
      const payload = await loadJson<{ invoice?: DepositInvoice; error?: string }>("/api/wallet/deposits/usdt", { method: "POST", body: JSON.stringify({ refreshAmount }) });
      if (!payload.invoice) throw new Error(payload.error ?? t("wallet.usdt.deposit.error.create"));
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("wallet.usdt.deposit.error.create"));
    } finally {
      setCreating(false);
    }
  }, [load, t]);

  useEffect(() => {
    let mounted = true;
    load().then((payload) => {
      if (!mounted || autoCreated.current) return;
      const stale = !payload.invoice || ["cancelled", "expired"].includes(payload.invoice.status);
      // A person without a bound address always gets the 1 USDT binding invoice straight away.
      if ((payload.boundSenders ?? []).length === 0 && stale) {
        autoCreated.current = true;
        void createInvoice();
      }
    }).catch((loadError) => { if (mounted) setError(loadError instanceof Error ? loadError.message : t("wallet.usdt.deposit.error.load")); });
    return () => { mounted = false; };
  }, [load, createInvoice, t]);

  useEffect(() => {
    if (!inProgress && !bindingPending) return;
    return startVisiblePolling(() => {
      void load().then((payload) => {
        if (payload.invoice && CREDITED_STATUSES.includes(payload.invoice.status)) void onRefresh();
      }).catch(() => undefined);
    }, 15_000);
  }, [inProgress, bindingPending, load, onRefresh]);

  useEffect(() => {
    if (!inProgress) return;
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(tick);
  }, [inProgress]);

  const windowEndsAt = invoice?.amount_window_started_at ? Date.parse(invoice.amount_window_started_at) + AMOUNT_WINDOW_MS : 0;
  const windowOpen = windowEndsAt > now;

  async function copy(value: string, key: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied((current) => current === key ? null : current), 1600); } catch { setError(t("wallet.usdt.deposit.error.copy")); }
  }

  // With a linked address the person chooses: top up from it, or link another address (which
  // issues a binding invoice with the comment and the exact amount again).
  const showBoundView = bound.length > 0 && (mode === "bound" || !inProgress);
  const justBound = Boolean(invoice && creditedNow && data?.bindingResult === "bound");
  // Only results that have a message are shown; older events may carry a result that no longer does.
  const bindNote = data?.bindingResult && BIND_NOTE_RESULTS.includes(data.bindingResult)
    ? t(`wallet.usdt.deposit.bindNote.${data.bindingResult}` as MessageKey)
    : null;

  return <Sheet bare className="small" ariaLabel={t("wallet.usdt.deposit.title")} onClose={onClose}>
      <div className="modal-header"><button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button><h2>{t("wallet.usdt.deposit.title")}</h2><span /></div>
      {!data && !error ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
      {error ? <p className="topup-error">{error}</p> : null}

      {data && showBoundView ? <div className="ton-deposit-body usdt-bound-view">
        {justBound ? <p className="usdt-bound-banner" role="status">{t("wallet.usdt.deposit.justBound")}</p> : null}
        {!justBound ? <h3>{t("wallet.usdt.deposit.bound.title")}</h3> : null}
        <p className="transfer-summary">{t("wallet.usdt.deposit.bound.body")}</p>
        <div className="usdt-bound-list" aria-label={t("wallet.usdt.deposit.bound.addresses")}>
          {bound.map((item) => <code key={item.address}>{shortAddress(item.address)}</code>)}
        </div>
        {data.boundTransferLink ? <div className="ton-deposit-qr"><QRCodeSVG value={data.boundTransferLink} size={160} includeMargin /></div> : null}
        {data.depositAddress ? <CopyField label={t("wallet.usdt.deposit.address")} value={data.depositAddress} copied={copied === "address"} copyLabel={t("wallet.usdt.deposit.copy")} onCopy={() => void copy(data.depositAddress as string, "address")} /> : null}
        <p className="transfer-muted">{t("wallet.usdt.deposit.bound.exchangeNote")}</p>
        <button className="secondary-button" type="button" disabled={creating} onClick={() => { setMode("bind"); void createInvoice(inProgress ? false : true); }}>{creating ? t("app.common.loading") : t("wallet.usdt.deposit.bound.another")}</button>
      </div> : null}

      {data && !showBoundView && invoice ? <div className="ton-deposit-body">
        {creditedNow ? <div className={`ton-deposit-check-result status-${invoice.status}`}>
          <strong>{data.event?.settled_usd_amount ? t("wallet.usdt.deposit.creditedAmount", { amount: formatUsd(data.event.settled_usd_amount, locale) }) : t("wallet.usdt.deposit.credited")}</strong>
          {data.event ? <p>{tonUsdtUnitsToDecimal(data.event.amount_units)} USDT · {data.event.transaction_hash.slice(0, 8)}…</p> : null}
          {bindingPending ? <p>{t("wallet.usdt.deposit.bindChecking")}</p> : null}
          {bindNote ? <p>{bindNote}</p> : null}
        </div> : null}
        {inProgress ? <>
          <p className="usdt-must-comment" role="alert">{t("wallet.usdt.deposit.mustComment")}</p>
          <p className="transfer-summary">{t(bound.length > 0 ? "wallet.usdt.deposit.bindAnotherHint" : "wallet.usdt.deposit.bindHint")}</p>
          <p className="usdt-no-bind-note">{t("wallet.usdt.deposit.noBindNote")}</p>
          <div className="ton-deposit-qr"><QRCodeSVG value={invoice.transferLink} size={176} includeMargin /></div>
          <CopyField label={t("wallet.usdt.deposit.address")} value={invoice.deposit_owner_address} copied={copied === "address"} copyLabel={t("wallet.usdt.deposit.copy")} onCopy={() => void copy(invoice.deposit_owner_address, "address")} />
          <CopyField label={t("wallet.usdt.deposit.comment")} value={invoice.comment} emphasized copied={copied === "comment"} copyLabel={t("wallet.usdt.deposit.copy")} onCopy={() => void copy(invoice.comment, "comment")} />
          {windowOpen && invoice.expected_amount_units ? <>
            <CopyField label={t("wallet.usdt.deposit.amountField")} value={tonUsdtUnitsToDecimal(invoice.expected_amount_units)} copied={copied === "amount"} copyLabel={t("wallet.usdt.deposit.copy")} onCopy={() => void copy(tonUsdtUnitsToDecimal(invoice.expected_amount_units as string), "amount")} />
            <p className="transfer-muted">{t("wallet.usdt.deposit.amountUntil", { time: new Date(windowEndsAt).toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" }) })}</p>
          </> : <>
            <p className="transfer-muted">{t("wallet.usdt.deposit.amountExpired")}</p>
            <button className="secondary-button" type="button" disabled={creating} onClick={() => void createInvoice(true)}>{creating ? t("app.common.loading") : t("wallet.usdt.deposit.amountRefresh")}</button>
          </>}
          <div className="ton-deposit-status"><span>{t("wallet.usdt.deposit.status")}</span><strong>{usdtDepositStatus(invoice.status, t)}</strong></div>
          <p className="transfer-muted">{t("wallet.usdt.deposit.averageCreditTime")}</p>
        </> : null}
        {bound.length > 0 ? <button className="secondary-button" type="button" onClick={() => setMode("bound")}>{t("wallet.usdt.deposit.backToBound")}</button> : null}
        {!inProgress && !bindingPending ? <button className="challenge-primary-action" type="button" disabled={creating} onClick={() => void createInvoice()}>{creating ? t("app.common.loading") : t("wallet.usdt.deposit.new")}</button> : null}
      </div> : null}

      {data && !showBoundView && !invoice && creating ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
  </Sheet>;
}

function CopyField({ label, value, copied, copyLabel, emphasized, onCopy }: { label: string; value: string; copied: boolean; copyLabel: string; emphasized?: boolean; onCopy: () => void }) {
  return <div className={emphasized ? "usdt-copy-field emphasized" : "usdt-copy-field"}>
    <span>{label}</span>
    <div><code>{value}</code><button type="button" aria-label={`${copyLabel}: ${label}`} onClick={onCopy}>{copied ? <Check size={18} /> : <Copy size={18} />}</button></div>
  </div>;
}

function shortAddress(address: string): string {
  return address.length > 16 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;
}

export function TonUsdtWithdrawalModal({ locale, t, wallet, onClose, onSuccess }: { locale: AppLocale; t: TFunction; wallet: WalletRow; onClose: () => void; onSuccess: (wallet: WalletRow) => Promise<void> }) {
  const [quote, setQuote] = useState<WithdrawalQuote | null>(null);
  const [withdrawal, setWithdrawal] = useState<Withdrawal | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [linkedAddresses, setLinkedAddresses] = useState<string[]>([]);
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

  // The linked deposit address is the default destination, so money goes back where it came from.
  // The person can type any other address.
  useEffect(() => {
    let mounted = true;
    void loadJson<DepositPayload>("/api/wallet/deposits/usdt?active=true").then((payload) => {
      if (!mounted) return;
      const addresses = (payload.boundSenders ?? []).map((item) => item.address);
      setLinkedAddresses(addresses);
      if (addresses[0]) setDestination((current) => current || addresses[0]);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

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

  return <Sheet bare className="small" ariaLabel={t("wallet.usdt.withdraw.title")} onClose={onClose}>
    <div className="modal-header"><button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button><h2>{t("wallet.usdt.withdraw.title")}</h2><span /></div>
    {loading ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
    {!loading && !withdrawal && quote ? <div className="ton-withdraw-body">
      <div className="topup-balance-info"><div className="topup-balance-card"><span>{t("wallet.availableBalance")}</span><strong className="wallet-color">{formatUsd(String(wallet.balance), locale)}</strong></div><div className="topup-balance-card"><span>{t("wallet.usdt.withdraw.rate")}</span><strong>{formatUsd(quote.usdtUsdRate, locale)} / USDT</strong></div></div>
      {!enabled ? <p className="topup-error">{error ?? t("wallet.usdt.withdraw.unavailable.setup")}</p> : <>
        <label className="finance-field"><span>{t("wallet.usdt.withdraw.amount")}</span><input inputMode="decimal" value={amount} onChange={(input) => { setAmount(input.target.value); setError(null); }} placeholder="Например, 10" /></label>
        <label className="finance-field"><span>{t("wallet.usdt.withdraw.address")}</span><div className="input-with-scan"><input value={destination} onChange={(input) => { setDestination(input.target.value); setError(null); }} placeholder="TON-адрес" autoComplete="off" /><QrScanButton onScan={(text) => { const scanned = parseScanned(text); if (scanned.kind === "ton") { setDestination(scanned.address); setError(null); } else setError(t("scan.wrongAddress")); }} /></div></label>
        {linkedAddresses.length > 0 ? <div className="usdt-bound-list" aria-label={t("wallet.usdt.deposit.bound.addresses")}>
          {linkedAddresses.map((address) => <button className={destination === address ? "usdt-linked-chip active" : "usdt-linked-chip"} key={address} type="button" onClick={() => { setDestination(address); setError(null); }}>{shortAddress(address)}</button>)}
        </div> : null}
        <div className="ton-withdraw-fees"><div><span>{t("wallet.usdt.withdraw.payout")}</span><strong>{formatUsd(String(payout), locale)}</strong></div><div><span>{t("wallet.usdt.withdraw.serviceFee", { percent: quote.serviceFeePercent })}</span><strong>{formatUsd(String(service), locale)}</strong></div><div><span>{t("wallet.usdt.withdraw.networkFee")}</span><strong>{formatUsd(String(network), locale)}</strong></div><div className="ton-withdraw-total"><span>{t("wallet.usdt.withdraw.total")}</span><strong>{formatUsd(String(total), locale)}</strong></div></div>
        {!amountValid && amount ? <p className="topup-error">{t("wallet.usdt.withdraw.error.amountRange", { min: quote.minAmountUsdt, max: quote.maxAmountUsdt })}</p> : null}{amountValid && !balanceValid ? <p className="topup-error">{t("wallet.usdt.withdraw.error.insufficient")}</p> : null}
        <div className="topup-modal-actions"><button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button><button className="challenge-primary-action" type="button" disabled={!amountValid || !destination.trim() || !balanceValid || saving} onClick={() => void createWithdrawal()}>{saving ? t("app.common.loading") : t("wallet.usdt.withdraw.confirm")}</button></div>
      </>}
    </div> : null}
    {!loading && !quote && !withdrawal && error ? <p className="topup-error">{error}</p> : null}
    {withdrawal ? <div className="ton-withdraw-body"><div className="ton-deposit-status"><span>{t("wallet.usdt.withdraw.status")}</span><strong>{usdtWithdrawalStatus(withdrawal.status, t)}</strong></div><ValueRow label={t("wallet.usdt.withdraw.amount")} value={`${withdrawal.amount_usdt ?? "—"} USDT`} /><ValueRow label={t("wallet.usdt.withdraw.address")} value={withdrawal.destination_address} />{withdrawal.message_hash ? <p className="transfer-muted">{withdrawal.message_hash}</p> : null}{withdrawal.error_message ? <p className="topup-error">{withdrawal.error_message}</p> : null}<button className="challenge-primary-action" type="button" onClick={onClose}>{t("app.common.done")}</button></div> : null}
  </Sheet>;
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
function formatUsd(value: string, locale: AppLocale): string { return formatRateMoney(Number(value), locale); }
function usdtDepositStatus(status: string, t: TFunction): string { const key = `wallet.usdt.deposit.status.${status}` as MessageKey; return t(key); }
function usdtWithdrawalStatus(status: string, t: TFunction): string { const key = `wallet.usdt.withdraw.status.${status}` as MessageKey; return t(key); }
