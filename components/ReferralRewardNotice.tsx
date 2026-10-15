"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import type { ReferralSummary } from "@/components/ReferralProgramSummary";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

/** Shows referral rewards the user has not seen yet when the app opens, then marks them as seen. */
export default function ReferralRewardNotice() {
  const { t, locale, user } = useUserContext();
  const [unseen, setUnseen] = useState<ReferralSummary["unseen"]>([]);

  useEffect(() => {
    if (!user) {
      setUnseen([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/referrals/summary?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
        if (!response.ok) return;
        const payload = (await response.json()) as ReferralSummary;
        if (!cancelled) setUnseen(payload.unseen ?? []);
      } catch {
        // Missing the notice is harmless: the rewards stay unseen and show next time.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function acknowledge() {
    setUnseen([]);
    try {
      await fetchWithSupabaseAuth("/api/referrals/rewards/seen", { method: "POST", cache: "no-store" }, { authRequired: true });
    } catch {
      // The rewards simply show again at the next launch.
    }
  }

  if (!user || unseen.length === 0) return null;
  const wallet = unseen.filter((row) => row.destination === "wallet").reduce((sum, row) => sum + row.amount, 0);
  const core = unseen.filter((row) => row.destination === "core").reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => void acknowledge()}>
      <section className="modal-sheet small" role="dialog" aria-modal="true" aria-labelledby="referral-reward-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="referral-reward-title">{t("referral.notice.title")}</h2>
        <p>{t("referral.notice.count", { count: unseen.length })}</p>
        <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
          {wallet > 0 ? <li>{t("referral.notice.wallet", { amount: formatAdaptiveMoney(wallet, locale) })}</li> : null}
          {core > 0 ? <li>{t("referral.notice.core", { amount: formatAdaptiveMoney(core, locale) })}</li> : null}
        </ul>
        <button className="challenge-primary-action" type="button" onClick={() => void acknowledge()}>{t("referral.notice.ok")}</button>
      </section>
    </div>
  );
}
