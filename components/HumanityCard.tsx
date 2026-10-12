"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type HumanityStatus = {
  available: boolean;
  level: number;
  status: "unverified" | "pending" | "verified" | "review_required" | "rejected" | "expired";
  lastAttemptStatus: string | null;
};

const POLL_INTERVAL_MS = 10_000;
const POLL_MAX_MS = 180_000;

/**
 * Optional card on Home: confirm that you are a person (short face check by an external provider,
 * no passport). It appears only when the provider is configured and the user is not yet confirmed.
 * Confirmation unlocks rewards that require a unique person, for example the leader bonus in Wallet.
 */
export default function HumanityCard({ active }: { active: boolean }) {
  const { t, locale, user } = useUserContext();
  const [state, setState] = useState<HumanityStatus | null>(null);
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returned, setReturned] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetchWithSupabaseAuth("/api/humanity/status", { cache: "no-store" }, { authRequired: true });
      if (!response.ok) return null;
      const next = (await response.json()) as HumanityStatus;
      setState(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!active || !user) return;
    const fromUrl = new URLSearchParams(window.location.search).get("humanity") === "done";
    setReturned(fromUrl);
    void load();
  }, [active, user, load]);

  useEffect(() => {
    if (!returned || !user) return;
    let stopped = false;
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      const next = await load();
      if (stopped) return;
      if ((next && next.level >= 2) || Date.now() - startedAt > POLL_MAX_MS) window.clearInterval(timer);
    }, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [returned, user, load]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/humanity/start", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, locale })
      }, { authRequired: true });
      const payload = (await response.json()) as { url?: string; code?: string };
      if (!response.ok || !payload.url) {
        setError(payload.code === "rate_limited" ? t("humanity.rateLimited") : t("humanity.startFailed"));
        return;
      }
      window.location.assign(payload.url);
    } catch {
      setError(t("humanity.startFailed"));
    } finally {
      setStarting(false);
    }
  }

  if (!active || !user || !state || !state.available) return null;
  if (state.level >= 2) return null;

  const waiting = returned || state.status === "pending";
  const inReview = state.status === "review_required";
  const rejected = state.status === "rejected" && !waiting;

  return (
    <section className="humanity-card" aria-label={t("humanity.title")} style={{ margin: "12px 0", padding: 14, borderRadius: 16, background: "rgba(0, 113, 227, 0.08)" }}>
      <strong>{t("humanity.title")}</strong>
      <p className="transfer-muted" style={{ margin: "6px 0" }}>{t("humanity.intro")}</p>
      {waiting ? <p>{t("humanity.waiting")}</p> : null}
      {inReview ? <p>{t("humanity.inReview")}</p> : null}
      {rejected ? <p className="topup-error">{t("humanity.rejected")}</p> : null}
      {!waiting && !inReview ? (
        <>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "8px 0" }}>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
            <span className="transfer-muted">{t("humanity.consent")}</span>
          </label>
          {error ? <p className="topup-error">{error}</p> : null}
          <button className="challenge-primary-action" type="button" disabled={!consent || starting} onClick={() => void start()}>
            {starting ? t("app.common.loading") : t("humanity.start")}
          </button>
          <p className="transfer-muted" style={{ marginTop: 8 }}>{t("humanity.alternative")}</p>
        </>
      ) : null}
    </section>
  );
}
