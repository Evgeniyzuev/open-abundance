"use client";

import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import type { TonConnectUI } from "@tonconnect/ui";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { connectWallet, connectedAddress, getTonConnect, sendPreparedTransaction } from "@/lib/tonConnectClient";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

/**
 * "Pay from wallet": connects the person's own TON wallet through TON Connect and sends it a transfer our server
 * prepared (deposit address, amount, invoice comment). The usual scanner credits it, so the deposit screen around this
 * block keeps showing the status as before.
 */
export default function TonConnectPay({ asset, invoiceId, defaultAmount, locale, t, onSent }: {
  asset: "TON" | "USDT";
  invoiceId?: string | null;
  defaultAmount?: string | null;
  locale: string;
  t: TFunction;
  onSent?: () => void;
}) {
  const [ui, setUi] = useState<TonConnectUI | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState(defaultAmount ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => { if (defaultAmount) setAmount(defaultAmount); }, [defaultAmount]);

  // Restores a wallet connected earlier, so a returning person sees "Pay" straight away.
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    getTonConnect(locale).then((instance) => {
      if (cancelled) return;
      setUi(instance);
      setAddress(connectedAddress(instance));
      stop = instance.onStatusChange((wallet) => setAddress(wallet?.account?.address ?? null));
    }).catch(() => undefined);
    return () => { cancelled = true; stop?.(); };
  }, [locale]);

  const numeric = Number(amount.replace(",", "."));
  const amountValid = Number.isFinite(numeric) && numeric > 0;

  async function pay() {
    if (!amountValid) { setNote({ kind: "error", text: t("wallet.tonconnect.amountInvalid") }); return; }
    setBusy(true);
    setNote(null);
    try {
      const instance = ui ?? await getTonConnect(locale);
      setUi(instance);
      const sender = await connectWallet(instance);
      if (!sender) return;
      const response = await fetchWithSupabaseAuth("/api/wallet/deposits/tonconnect", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, invoiceId: invoiceId ?? undefined, senderAddress: sender, amount: amount.trim().replace(",", ".") })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { transaction?: Parameters<typeof sendPreparedTransaction>[1]; error?: string };
      if (!response.ok || !payload.transaction) { setNote({ kind: "error", text: payload.error ?? t("wallet.tonconnect.error") }); return; }
      try {
        await sendPreparedTransaction(instance, payload.transaction);
      } catch {
        setNote({ kind: "error", text: t("wallet.tonconnect.cancelled") });
        return;
      }
      setNote({ kind: "ok", text: t("wallet.tonconnect.sent") });
      onSent?.();
    } catch {
      setNote({ kind: "error", text: t("wallet.tonconnect.error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tonconnect-pay">
      <strong>{t("wallet.tonconnect.title")}</strong>
      <p className="transfer-muted">{t("wallet.tonconnect.hint")}</p>
      <label className="finance-field">
        <span>{t(asset === "TON" ? "wallet.tonconnect.amountTon" : "wallet.tonconnect.amountUsdt")}</span>
        <input inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setNote(null); }} />
      </label>
      <button className="challenge-primary-action" type="button" disabled={busy || !amountValid} onClick={() => void pay()}>
        <Wallet size={16} />
        {busy ? t("app.common.loading") : address ? t("wallet.tonconnect.pay", { amount: amountValid ? amount.trim() : "", asset }) : t("wallet.tonconnect.connect")}
      </button>
      {address && ui ? (
        <p className="transfer-muted tonconnect-connected">
          {t("wallet.tonconnect.connected", { address: shortRaw(address) })}{" "}
          <button className="text-button" type="button" onClick={() => void ui.disconnect()}>{t("wallet.tonconnect.disconnect")}</button>
        </p>
      ) : null}
      {note ? <p className={note.kind === "ok" ? "cryptopay-done" : "topup-error"} role="status">{note.text}</p> : null}
    </div>
  );
}

function shortRaw(address: string): string {
  const hash = address.includes(":") ? address.split(":")[1] : address;
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}
