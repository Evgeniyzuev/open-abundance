"use client";

import { Flame } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { afterburnPreview, normalizeAfterburnKeepAmount } from "@/lib/coreAfterburn";
import { formatMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type AfterburnState = {
  enabled: boolean;
  keepAmount: number;
  lastRun: { date: string; status: "moved" | "failed"; amount: number } | null;
};

/**
 * Afterburn settings: when on, the night job moves the free Wallet balance above the kept amount into
 * Core right before the accrual. This panel only saves the setting; it never moves money itself.
 */
export default function CoreAfterburnPanel({ walletBalance, locale, t }: { walletBalance: number; locale: AppLocale; t: TFunction }) {
  const [state, setState] = useState<AfterburnState | null>(null);
  const [keepDraft, setKeepDraft] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWithSupabaseAuth("/api/core/afterburn", { cache: "no-store" }, { authRequired: true })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as AfterburnState & { error?: string };
        if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed");
        if (cancelled) return;
        setState(payload);
        setKeepDraft(String(payload.keepAmount));
      })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError)); });
    return () => { cancelled = true; };
  }, []);

  async function save(enabled: boolean) {
    const keepAmount = normalizeAfterburnKeepAmount(keepDraft);
    if (keepAmount === null) {
      setError(t("afterburn.keepInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/core/afterburn", {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, keepAmount })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as AfterburnState & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Request failed");
      setState(payload);
      setKeepDraft(String(payload.keepAmount));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  const enabled = state?.enabled ?? false;
  const keepAmount = normalizeAfterburnKeepAmount(keepDraft) ?? state?.keepAmount ?? 0;
  const preview = afterburnPreview(walletBalance, keepAmount);
  const keepChanged = state !== null && normalizeAfterburnKeepAmount(keepDraft) !== state.keepAmount;

  return (
    <section className={`core-afterburn${enabled ? " is-on" : ""}`} aria-label={t("afterburn.title")}>
      <div className="core-afterburn-head">
        <span className="core-afterburn-icon" aria-hidden="true"><Flame size={20} /></span>
        <span className="core-afterburn-title"><strong>{t("afterburn.title")}</strong><small>{t("afterburn.subtitle")}</small></span>
        <button
          className="core-afterburn-switch"
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("afterburn.title")}
          disabled={state === null || saving}
          onClick={() => { void save(!enabled); }}
        >
          <span />
        </button>
      </div>
      <label className="core-afterburn-keep">
        <span>{t("afterburn.keep")}</span>
        <input type="text" inputMode="decimal" value={keepDraft} disabled={state === null || saving} onChange={(event) => setKeepDraft(event.target.value)} />
        {keepChanged ? <button className="text-button" type="button" disabled={saving} onClick={() => { void save(enabled); }}>{t("afterburn.saveKeep")}</button> : null}
      </label>
      <p className="core-afterburn-preview">
        {enabled
          ? preview > 0 ? t("afterburn.tonight", { amount: formatMoney(preview, locale) }) : t("afterburn.nothing")
          : t("afterburn.off")}
      </p>
      {state?.lastRun ? (
        <p className="core-afterburn-last">
          {state.lastRun.status === "moved"
            ? t("afterburn.last", { date: new Date(`${state.lastRun.date}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", timeZone: "UTC" }), amount: formatMoney(state.lastRun.amount, locale) })
            : t("afterburn.lastFailed")}
        </p>
      ) : null}
      <small>{t("afterburn.note")}</small>
      {error ? <p className="finance-error">{error}</p> : null}
    </section>
  );
}
