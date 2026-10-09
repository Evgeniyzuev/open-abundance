"use client";

import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type PaymentRequest = {
  id: string;
  amount: number | string;
  note: string | null;
  status: "open" | "paid" | "cancelled";
  expires_at: string;
  link: string;
};

type Props = { locale: AppLocale; onClose: () => void };

/** Ask someone to pay a fixed amount: creates a link and QR, lists own requests. */
export default function PaymentRequestModal({ locale, onClose }: Props) {
  const { t } = useUserContext();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<PaymentRequest | null>(null);
  const [recent, setRecent] = useState<PaymentRequest[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadRecent = useCallback(async () => {
    try {
      const response = await fetchWithSupabaseAuth("/api/wallet/requests", { cache: "no-store" }, { authRequired: true });
      const payload = (await response.json()) as { requests?: PaymentRequest[] };
      if (response.ok) setRecent(payload.requests ?? []);
    } catch {
      // The list is a convenience; creating a request works without it.
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/wallet/requests", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount.replace(",", "."), note })
      }, { authRequired: true });
      const payload = (await response.json()) as { request?: PaymentRequest; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error ?? t("pay.request.failed"));
      setCreated(payload.request);
      setCopied(false);
      void loadRecent();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("pay.request.failed"));
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    await fetchWithSupabaseAuth(`/api/wallet/requests/${id}/cancel`, { method: "POST", cache: "no-store" }, { authRequired: true }).catch(() => undefined);
    if (created?.id === id) setCreated(null);
    void loadRecent();
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function shareLink(link: string) {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Open Abundance", text: t("pay.request.shareText"), url: link });
        return;
      } catch {
        // Fall through to copying when sharing is cancelled or unavailable.
      }
    }
    await copyLink(link);
  }

  const amountNumber = Number(amount.replace(",", "."));
  const valid = Number.isFinite(amountNumber) && amountNumber > 0;
  const statusKey = (status: PaymentRequest["status"], expiresAt: string): MessageKey =>
    status === "open" && Date.parse(expiresAt) <= Date.now() ? "pay.status.expired" : (`pay.status.${status}` as MessageKey);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-labelledby="pay-request-title" onClick={(event) => event.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto" }}>
        <h2 id="pay-request-title">{t("pay.request.title")}</h2>

        {created ? (
          <div className="payment-request-share">
            <p><strong>{formatAdaptiveMoney(Number(created.amount), locale)}</strong>{created.note ? ` · ${created.note}` : ""}</p>
            <div style={{ display: "grid", placeItems: "center", margin: "12px 0" }}>
              <QRCodeSVG value={created.link} size={184} includeMargin />
            </div>
            <p className="transfer-muted" style={{ overflowWrap: "anywhere" }}>{created.link}</p>
            <div className="topup-modal-actions">
              <button className="secondary-button" type="button" onClick={() => void copyLink(created.link)}>{copied ? t("pay.request.copied") : t("pay.request.copy")}</button>
              <button className="challenge-primary-action" type="button" onClick={() => void shareLink(created.link)}>{t("pay.request.share")}</button>
            </div>
            <p className="transfer-muted">{t("pay.request.expires")}</p>
            <button className="text-button" type="button" onClick={() => { setCreated(null); setAmount(""); setNote(""); }}>{t("pay.request.another")}</button>
          </div>
        ) : (
          <>
            <div className="topup-field">
              <span>{t("pay.request.amount")}</span>
              <input type="text" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setError(null); }} placeholder="0" autoFocus />
            </div>
            <div className="topup-field">
              <span>{t("pay.request.note")}</span>
              <input type="text" maxLength={140} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            {error ? <p className="topup-error">{error}</p> : null}
            <div className="topup-modal-actions">
              <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
              <button className="challenge-primary-action" type="button" disabled={!valid || saving} onClick={() => void create()}>
                {saving ? t("app.common.loading") : t("pay.request.create")}
              </button>
            </div>
          </>
        )}

        {recent.length > 0 ? (
          <section aria-label={t("pay.request.recent")} style={{ marginTop: 16 }}>
            <h3>{t("pay.request.recent")}</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {recent.slice(0, 8).map((item) => (
                <li key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span>
                    <strong>{formatAdaptiveMoney(Number(item.amount), locale)}</strong>
                    {item.note ? ` · ${item.note}` : ""}
                    <br />
                    <small className="transfer-muted">{t(statusKey(item.status, item.expires_at))}</small>
                  </span>
                  {item.status === "open" && Date.parse(item.expires_at) > Date.now() ? (
                    <span style={{ display: "flex", gap: 6 }}>
                      <button className="secondary-button" type="button" onClick={() => setCreated(item)}>QR</button>
                      <button className="text-button" type="button" onClick={() => void cancel(item.id)}>{t("pay.request.cancel")}</button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </div>
  );
}
