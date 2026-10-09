"use client";

import { useCallback, useEffect, useState } from "react";
import { UserLevelBadge } from "@/components/UserLevelBadge";
import { useUserContext } from "@/components/UserProvider";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { isUuid } from "@/lib/uuid";

const PENDING_KEY = "oa-pending-payment-request";

type RequestView = {
  request: { id: string; amount: number; note: string | null; status: "open" | "paid" | "cancelled" | "expired"; isOwn: boolean; paidByMe: boolean };
  payee: { user_id: string; username: string | null; display_name: string | null; level: number };
};

/**
 * Opens the payment confirmation when the app is opened from a payment link
 * (`/?pay=<request id>`). The link is remembered across sign-in so the payer lands
 * on the confirmation after logging in.
 */
export default function PayRequestEntry() {
  const { t, locale, user, refreshUserData } = useUserContext();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [view, setView] = useState<RequestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("pay");
      if (fromUrl && isUuid(fromUrl)) window.sessionStorage.setItem(PENDING_KEY, fromUrl);
    } catch {
      // Storage can be unavailable; the link still works while the URL keeps the id.
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    try {
      const pending = window.sessionStorage.getItem(PENDING_KEY);
      if (pending && isUuid(pending)) setRequestId(pending);
    } catch {
      const fromUrl = new URLSearchParams(window.location.search).get("pay");
      if (fromUrl && isUuid(fromUrl)) setRequestId(fromUrl);
    }
  }, [user]);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    setView(null);
    setError(null);
    setPaid(false);
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/wallet/requests/${requestId}`, { cache: "no-store" }, { authRequired: true });
        const payload = (await response.json()) as RequestView & { error?: string };
        if (cancelled) return;
        if (!response.ok) setError(response.status === 404 ? t("pay.confirm.notFound") : payload.error ?? t("pay.confirm.failed"));
        else setView(payload);
      } catch {
        if (!cancelled) setError(t("pay.confirm.failed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, t]);

  const close = useCallback(() => {
    setRequestId(null);
    setView(null);
    try {
      window.sessionStorage.removeItem(PENDING_KEY);
      const url = new URL(window.location.href);
      if (url.searchParams.has("pay")) {
        url.searchParams.delete("pay");
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      // Cleaning the address bar is cosmetic.
    }
  }, []);

  async function pay() {
    if (!requestId) return;
    setPaying(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth(`/api/wallet/requests/${requestId}/pay`, { method: "POST", cache: "no-store" }, { authRequired: true });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        const message = payload.error ?? "";
        setError(message.includes("Insufficient") ? t("pay.confirm.insufficient") : message.includes("already paid") ? t("pay.confirm.alreadyPaid") : t("pay.confirm.failed"));
        return;
      }
      setPaid(true);
      void refreshUserData();
    } catch {
      setError(t("pay.confirm.failed"));
    } finally {
      setPaying(false);
    }
  }

  if (!requestId || !user) return null;

  const status = view?.request.status;
  const name = view ? view.payee.display_name || view.payee.username || t("pay.confirm.someone") : "";
  const blocked = view
    ? view.request.isOwn ? t("pay.confirm.own")
      : status === "paid" ? (view.request.paidByMe ? t("pay.confirm.paidMe") : t("pay.confirm.alreadyPaid"))
      : status === "expired" ? t("pay.confirm.expired")
      : status === "cancelled" ? t("pay.confirm.cancelled")
      : null
    : null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-labelledby="pay-confirm-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="pay-confirm-title">{t("pay.confirm.title")}</h2>
        {!view && !error ? <p className="transfer-muted">{t("app.common.loading")}</p> : null}
        {view ? (
          <>
            <p className="transfer-muted">{t("pay.confirm.to")}</p>
            <p>
              <strong>{name}</strong>{" "}
              {view.payee.level ? <UserLevelBadge label={t("profile.levelBadge", { level: view.payee.level })} level={view.payee.level} /> : null}
            </p>
            <p style={{ fontSize: "1.8rem", fontWeight: 800, margin: "8px 0" }}>{formatAdaptiveMoney(view.request.amount, locale)}</p>
            {view.request.note ? <p>{view.request.note}</p> : null}
            {paid ? <p className="transfer-summary">{t("pay.confirm.paid")}</p> : blocked ? <p className="transfer-muted">{blocked}</p> : null}
          </>
        ) : null}
        {error ? <p className="topup-error">{error}</p> : null}
        <div className="topup-modal-actions">
          <button className="text-button" type="button" onClick={close}>{paid || blocked || error ? t("app.common.close") : t("app.common.cancel")}</button>
          {view && !paid && !blocked ? (
            <button className="challenge-primary-action" type="button" disabled={paying} onClick={() => void pay()}>
              {paying ? t("app.common.loading") : t("pay.confirm.pay", { amount: formatAdaptiveMoney(view.request.amount, locale) })}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
