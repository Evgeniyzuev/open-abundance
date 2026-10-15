"use client";

import { Check, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import type { MessageKey } from "@/lib/i18n";
import { grossUpForFee } from "@/lib/cryptoPayFee";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { startVisiblePolling } from "@/lib/visiblePolling";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;
type Limits = { enabled: boolean; network: "mainnet" | "testnet"; minUsd: number; maxUsd: number; dailyUsd: number; feePercent: number };
type Invoice = { id: string; usdAmount: number; payUsdAmount: number; feeUsd: number; payUrl: string | null; miniAppUrl: string | null; expiresAt: string; network: string };

const PRESETS = [5, 10, 25, 50];

/** Top-up through CryptoBot: pick a USD amount, pay in the bot, the status updates here on its own. */
export default function CryptoPayDepositModal({ t, onClose, onRefresh }: { t: TFunction; onClose: () => void; onRefresh: () => Promise<void> }) {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [amount, setAmount] = useState("10");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [status, setStatus] = useState<string>("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithSupabaseAuth("/api/wallet/deposits/cryptopay", { cache: "no-store" }, { authRequired: true })
      .then((response) => response.json())
      .then((payload: Limits) => { if (!cancelled) setLimits(payload); })
      .catch(() => { if (!cancelled) setError(t("wallet.cryptopay.error.generic")); });
    return () => { cancelled = true; };
    // t is stable for the life of the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While an invoice is open, ask for its status every few seconds; the server re-checks with the provider.
  useEffect(() => {
    if (!invoice || status !== "active") return;
    let cancelled = false;
    const stop = startVisiblePolling(async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/wallet/deposits/cryptopay?id=${invoice.id}`, { cache: "no-store" }, { authRequired: true });
        const payload = (await response.json()) as { invoice?: { status: string } };
        if (!cancelled && payload.invoice) setStatus(payload.invoice.status);
      } catch { /* the next check asks again */ }
    }, 4000);
    return () => { cancelled = true; stop(); };
  }, [invoice, status]);

  useEffect(() => {
    if (status === "credited" && !refreshed.current) { refreshed.current = true; void onRefresh(); }
  }, [status, onRefresh]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/wallet/deposits/cryptopay", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount.replace(",", ".")) })
      }, { authRequired: true });
      const payload = (await response.json()) as { invoice?: Invoice; code?: string };
      if (!response.ok || !payload.invoice) {
        setError(payload.code === "daily_limit" ? t("wallet.cryptopay.error.daily") : payload.code === "too_many_open" ? t("wallet.cryptopay.error.open") : t("wallet.cryptopay.error.generic"));
        return;
      }
      setInvoice(payload.invoice);
      setStatus("active");
    } catch {
      setError(t("wallet.cryptopay.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  const numeric = Number(amount.replace(",", "."));
  const amountValid = limits ? Number.isFinite(numeric) && numeric >= limits.minUsd && numeric <= limits.maxUsd : false;
  const done = status === "credited" || status === "paid_test";

  return (
    <Sheet bare className="small" ariaLabel={t("wallet.cryptopay.title")} onClose={onClose}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{done ? t("app.common.done") : t("app.common.cancel")}</button>
          <h2>{t("wallet.cryptopay.title")}</h2>
          <span />
        </div>
        <div className="cryptopay-body">
          {limits?.network === "testnet" ? <p className="cryptopay-test" role="note">{t("wallet.cryptopay.testNote")}</p> : null}
          {!invoice ? (
            <>
              <p className="transfer-muted">{t("wallet.cryptopay.intro")}</p>
              <div className="cryptopay-presets" role="group" aria-label={t("wallet.cryptopay.amount")}>
                {PRESETS.filter((value) => !limits || value <= limits.maxUsd).map((value) => (
                  <button className={Number(amount) === value ? "chip is-active" : "chip"} key={value} type="button" onClick={() => setAmount(String(value))}>${value}</button>
                ))}
              </div>
              <label className="finance-field">
                <span>{t("wallet.cryptopay.amount")}</span>
                <input inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setError(null); }} />
              </label>
              {limits ? <small className="transfer-muted">{t("wallet.cryptopay.limits", { min: limits.minUsd, max: limits.maxUsd })}</small> : null}
              {limits && amountValid && limits.feePercent > 0 ? (
                <p className="cryptopay-quote" role="status">
                  {t("wallet.cryptopay.quote", { pay: grossUpForFee(numeric, limits.feePercent).toFixed(2), fee: (grossUpForFee(numeric, limits.feePercent) - numeric).toFixed(2), percent: limits.feePercent, credit: numeric.toFixed(2) })}
                </p>
              ) : null}
              {error ? <p className="topup-error">{error}</p> : null}
              <button className="challenge-primary-action" type="button" disabled={busy || !amountValid || !limits?.enabled} onClick={() => void create()}>
                {busy ? t("app.common.loading") : t("wallet.cryptopay.create", { amount: Number.isFinite(numeric) ? numeric : 0 })}
              </button>
              {limits && !limits.enabled ? <p className="topup-error">{t("wallet.cryptopay.unavailable")}</p> : null}
            </>
          ) : (
            <>
              <p className="cryptopay-amount">${invoice.payUsdAmount.toFixed(2)}</p>
              {invoice.feeUsd > 0 ? <p className="transfer-muted">{t("wallet.cryptopay.invoiceNote", { credit: invoice.usdAmount.toFixed(2), fee: invoice.feeUsd.toFixed(2) })}</p> : null}
              {status === "active" ? (
                <>
                  <p className="transfer-muted">{t("wallet.cryptopay.waiting")}</p>
                  {invoice.payUrl ? (
                    <a className="challenge-primary-action cryptopay-open" href={invoice.payUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={16} />{t("wallet.cryptopay.open")}
                    </a>
                  ) : null}
                </>
              ) : null}
              {status === "credited" ? <p className="cryptopay-done"><Check size={18} />{t("wallet.cryptopay.credited", { amount: invoice.usdAmount.toFixed(2) })}</p> : null}
              {status === "paid_test" ? <p className="cryptopay-done"><Check size={18} />{t("wallet.cryptopay.testPaid")}</p> : null}
              {status === "expired" ? <p className="topup-error">{t("wallet.cryptopay.expired")}</p> : null}
            </>
          )}
        </div>
    </Sheet>
  );
}
